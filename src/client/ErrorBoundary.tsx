import { Component, type ReactNode } from "react";
import { AuthCard } from "@/AuthCard";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/** Catches render-time crashes anywhere in the tree and offers a reload. A class
 *  because React has no hook for this. */
export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error("Unhandled UI error:", error);
    }

    render() {
        if (this.state.error) {
            return (
                <AuthCard>
                    <Notice tone="danger" title="Something went wrong">
                        The app hit an unexpected error. Reloading usually fixes
                        it; your data is safe.
                    </Notice>
                    <Button
                        variant="solid"
                        className="w-full"
                        onClick={() => window.location.reload()}
                    >
                        Reload
                    </Button>
                </AuthCard>
            );
        }

        return this.props.children;
    }
}
