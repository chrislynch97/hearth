import { AuthCard } from "@/AuthCard";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface ConnectionErrorProps {
    onRetry: () => void;
    retrying?: boolean;
}

/** Shown when a critical query can't reach the server. */
export const ConnectionError = ({
    onRetry,
    retrying,
}: ConnectionErrorProps) => (
    <AuthCard>
        <Notice tone="danger" title="Can't reach the server">
            Hearth couldn't load your data. Check that the server is running,
            then try again.
        </Notice>
        <Button
            variant="solid"
            className="w-full"
            disabled={retrying}
            onClick={onRetry}
        >
            Retry
        </Button>
    </AuthCard>
);
