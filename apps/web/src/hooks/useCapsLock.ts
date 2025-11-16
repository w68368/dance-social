import { useState, useCallback } from "react";

export function useCapsLock() {
  const [capsLock, setCapsLock] = useState(false);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ("getModifierState" in e) {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }, []);

  const reset = useCallback(() => setCapsLock(false), []);

  return { capsLock, handleKey, reset };
}
