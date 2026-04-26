import { useState, useEffect } from 'react';

export function useClock() {
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 8));

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toTimeString().slice(0, 8));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}
