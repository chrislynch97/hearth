import { Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { PersonAvatar } from "@/layout/PersonAvatar";

/** Your avatar in the top bar, straight through to your account settings. */
export const ProfileLink = () => {
    const me = trpc.users.me.useQuery();

    const name = me.data?.displayName || me.data?.username || "You";

    return (
        <Link
            to="/settings/account"
            aria-label="Your profile"
            className="flex rounded-full transition-opacity duration-[140ms] ease-out hover:opacity-80"
        >
            <PersonAvatar name={name} size={30} />
        </Link>
    );
};
