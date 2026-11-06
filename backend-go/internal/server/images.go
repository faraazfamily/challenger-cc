package server

import (
	"bytes"
	"database/sql"
	"encoding/binary"
	"errors"
	"image"
	_ "image/gif" // registered so image.Decode can read the formats phones upload
	"image/jpeg"
	_ "image/png"
	"regexp"
	"strconv"
	"sync"

	"golang.org/x/image/draw"
)

// Photos come straight off a phone camera (3-5 MB, 3000+ px) but are shown at 40-190 px.
// Two things keep pages fast:
//   - uploads are capped at maxUploadSide on the long edge before they are stored;
//   - /uploads/<name>?w=<px> serves a resized JPEG, made once and kept in the files table
//     (and in memory) so later requests cost nothing.
//
// HEIC and other formats Go cannot decode are stored and served as they are.
const (
	maxUploadSide   = 1600
	maxDecodePixels = 60_000_000
	resizedQuality  = 82
)

var allowedWidths = map[int]bool{96: true, 200: true, 400: true, 800: true}

var resizedCache sync.Map // "w400-<name>" -> []byte

var variantName = regexp.MustCompile(`^w[0-9]+-`)

// isVariantName reports whether a stored file is itself a resized copy.
func isVariantName(name string) bool { return variantName.MatchString(name) }

// shrinkImage returns data scaled so its long edge is at most maxSide, as JPEG.
// Anything it cannot decode comes back unchanged with ok=false.
func shrinkImage(data []byte, maxSide int) (out []byte, contentType string, ok bool) {
	// Read the size first: a tiny file can claim gigantic dimensions and exhaust memory.
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width*cfg.Height > maxDecodePixels {
		return data, "", false
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return data, "", false
	}
	// Phone JPEGs are often stored sideways with an EXIF "rotate me" flag, which decoding
	// drops; bake the rotation in so the resized copy is not on its side.
	img = applyOrientation(img, jpegOrientation(data))
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxSide && h <= maxSide {
		return data, "", false
	}
	if w >= h {
		h = h * maxSide / w
		w = maxSide
	} else {
		w = w * maxSide / h
		h = maxSide
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: resizedQuality}); err != nil {
		return data, "", false
	}
	return buf.Bytes(), "image/jpeg", true
}

// resizedVariant returns the ?w= version of a stored image, making and saving it on first use.
func (s *Server) resizedVariant(name string, width int, original []byte) ([]byte, string, error) {
	key := "w" + strconv.Itoa(width) + "-" + name
	if v, hit := resizedCache.Load(key); hit {
		return v.([]byte), "image/jpeg", nil
	}
	var data []byte
	err := s.DB.QueryRow(`SELECT data FROM fn_file($1)`, key).Scan(&data)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, "", err
	}
	if errors.Is(err, sql.ErrNoRows) {
		var ok bool
		data, _, ok = shrinkImage(original, width)
		if !ok {
			// smaller than asked for, or not decodable: the original is the best we have
			return nil, "", errNoVariant
		}
		// best effort: a failed save only means it is made again next time
		_, _ = s.DB.Exec(`CALL sp_file_insert($1, $2, $3, true)`, key, "image/jpeg", data)
	}
	resizedCache.Store(key, data)
	return data, "image/jpeg", nil
}

var errNoVariant = errors.New("no resized variant")

// jpegOrientation reads the EXIF orientation tag (1-8) of a JPEG, or 1 when absent.
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	i := 2
	for i+4 <= len(data) && data[i] == 0xFF {
		marker := data[i+1]
		size := int(binary.BigEndian.Uint16(data[i+2:]))
		if marker == 0xDA || size < 2 { // start of scan: no EXIF after this
			break
		}
		if marker == 0xE1 && i+4+size-2 <= len(data) && bytes.HasPrefix(data[i+4:], []byte("Exif\x00\x00")) {
			return tiffOrientation(data[i+10 : i+2+size])
		}
		i += 2 + size
	}
	return 1
}

func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	ifd := int(order.Uint32(t[4:]))
	if ifd+2 > len(t) {
		return 1
	}
	n := int(order.Uint16(t[ifd:]))
	for k := 0; k < n; k++ {
		e := ifd + 2 + k*12
		if e+12 > len(t) {
			break
		}
		if order.Uint16(t[e:]) == 0x0112 { // Orientation
			v := int(order.Uint16(t[e+8:]))
			if v >= 1 && v <= 8 {
				return v
			}
			return 1
		}
	}
	return 1
}

// applyOrientation returns img rotated / flipped as the EXIF orientation says.
func applyOrientation(img image.Image, o int) image.Image {
	if o <= 1 || o > 8 {
		return img
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	swap := o >= 5 // 5-8 are the rotated-by-90 cases
	var dst *image.RGBA
	if swap {
		dst = image.NewRGBA(image.Rect(0, 0, h, w))
	} else {
		dst = image.NewRGBA(image.Rect(0, 0, w, h))
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch o {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.Set(dx, dy, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}
