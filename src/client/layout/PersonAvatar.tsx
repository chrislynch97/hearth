import { Avatar, type AvatarProps } from "@mantine/core";
import { hearthTokens } from "@/theme";

function paletteColor(seed: string): string {
    const { ownerPalette } = hearthTokens;

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }

    return (
        ownerPalette[Math.abs(hash) % ownerPalette.length] ?? ownerPalette[0]
    );
}

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
    const background = color ?? paletteColor(name);

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
