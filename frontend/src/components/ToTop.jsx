import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

// Round "back to top" button. Its ring fills as the page is read, so it also shows how far along you are.
export default function ToTop() {
  const [show, setShow] = useState(false);
  const ringRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const done = room > 0 ? Math.min(1, window.scrollY / room) : 0;
      ringRef.current?.setAttribute('stroke-dashoffset', String(1 - done));
      setShow(window.scrollY > 320);
    };
    const onChange = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onChange, { passive: true });
    window.addEventListener('resize', onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);

  function goUp() {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
  }

  return (
    <button type="button" className={`to-top ${show ? 'show' : ''}`} aria-label="Back to top" onClick={goUp}>
      <svg className="to-top-dial" viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
        <circle className="to-top-track" cx="26" cy="26" r="23" />
        <circle ref={ringRef} className="to-top-ring" cx="26" cy="26" r="23" pathLength="1" strokeDasharray="1" strokeDashoffset="1" />
      </svg>
      <ArrowUp size={22} strokeWidth={2.6} aria-hidden="true" />
    </button>
  );
}
