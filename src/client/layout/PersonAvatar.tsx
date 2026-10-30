import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { personColor } from "@/personColor";

export interface PersonAvatarProps {
    name: string;
    color?: string | null;
    /** Diameter in pixels. */
    size?: number;
}

const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase();

/** A person's initials in a ring of their colour. */
export const PersonAvatar = ({ name, color, size = 28 }: PersonAvatarProps) => {
    const ring = personColor(name, color);

    return (
        <Avatar
            aria-hidden
            className="border"
            style={{
                width: size,
                height: size,
                color: ring,
                borderColor: ring,
            }}
        >
            <AvatarFallback className="bg-transparent font-semibold text-inherit">
                {initials(name)}
            </AvatarFallback>
        </Avatar>
    );
};
