import { Check } from "lucide-react";

interface ToastProps {
    message: string | null;
}

export function Toast({ message }: ToastProps) {
    if (!message) return null;

    return (
        <div className="toast-notification">
            <Check size={13} />
            <span>{message}</span>
        </div>
    );
}
