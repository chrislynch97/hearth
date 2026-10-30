/** The colours a household member can pick (Settings → Household → Members),
 *  each mid-tone enough to read on both the light and dark surfaces. None is
 *  the brand moss or the warning apricot, so a person never reads as "primary"
 *  or "needs attention". */
export const PERSON_COLORS = [
    { name: "Slate", value: "#5f8796" },
    { name: "Clay", value: "#b9775c" },
    { name: "Ochre", value: "#b8954a" },
    { name: "Plum", value: "#8f6a8c" },
    { name: "Sky", value: "#6f93c0" },
    { name: "Rose", value: "#bf7282" },
    { name: "Lagoon", value: "#4f978e" },
    { name: "Stone", value: "#94877a" },
] as const;

const isPickable = (color: string) =>
    PERSON_COLORS.some((c) => c.value === color);

/** A person's colour as CSS: the one they picked from `PERSON_COLORS`, else one
 *  from it chosen by their name, so it's the same everywhere they appear.
 *  Older members store a palette name ("grape"); that counts as
 *  unpicked. */
export const personColor = (name: string, picked?: string | null): string => {
    if (picked && isPickable(picked)) return picked;

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }

    return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length]!.value;
};
