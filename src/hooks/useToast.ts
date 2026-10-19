import { useState, useCallback, useRef } from "react";

export function useToast(duration = 2000) {
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const showToast = useCallback((msg: string) => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
        }
        setToastMessage(msg);
        timeoutRef.current = window.setTimeout(() => {
            setToastMessage(null);
            timeoutRef.current = null;
        }, duration);
    }, [duration]);

    return { toastMessage, showToast };
}
