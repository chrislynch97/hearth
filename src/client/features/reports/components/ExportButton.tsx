import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ExportButtonProps {
    onClick: () => void;
}

export const ExportButton = ({ onClick }: ExportButtonProps) => (
    <Button
        compact
        icon={<Download />}
        className="max-sm:h-9 max-sm:w-full"
        onClick={onClick}
    >
        Export CSV
    </Button>
);
