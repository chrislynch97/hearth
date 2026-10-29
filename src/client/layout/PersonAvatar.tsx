import { Avatar, type AvatarProps } from "@mantine/core";
import { personColor } from "@/personColor";

export interface PersonAvatarProps extends Omit<AvatarProps, "color" | "name"> {
    name: string;
    color?: string | null;
}

export const PersonAvatar = ({
    name,
    color,
    size = 28,
    ...props
}: PersonAvatarProps) => {
    const background = personColor(name, color);

    return (
        <Avatar
            name={name}
            size={size}
            variant={"outline"}
            color={background}
            {...props}
        />
    );
};
