import { Button } from "@mantine/core";

export interface ExportButtonProps {
    onClick: () => void;
}

export const ExportButton = ({ onClick }: ExportButtonProps) => (
    <Button size="xs" variant="default" onClick={onClick}>
        Export CSV
    </Button>
);
