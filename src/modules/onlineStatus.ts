import { useEffect, useState } from "react";

export function readOnlineStatus(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(readOnlineStatus);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setOnline(readOnlineStatus());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
