import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { trpc } from "@/trpc";
import {
    SidebarFooter,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/shadcn/sidebar";
import { FeedbackModal } from "@/layout/FeedbackModal";

/** "Send feedback" at the foot of the sidebar — only where the instance has
 *  somewhere to send it, so there's no empty footer otherwise. */
export const SidebarFeedback = () => {
    const feedback = trpc.feedback.config.useQuery();

    const [open, setOpen] = useState(false);

    if (!feedback.data?.enabled) return null;

    return (
        <SidebarFooter className="hearth-ds border-t border-sidebar-border">
            <FeedbackModal opened={open} onClose={() => setOpen(false)} />
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        onClick={() => setOpen(true)}
                        className="text-base text-text-muted max-md:h-10 max-md:text-md"
                    >
                        <MessageSquare />
                        <span>Send feedback</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    );
};
