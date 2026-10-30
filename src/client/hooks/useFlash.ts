import { useEffect, useState } from "react";

/** A flag that switches itself off again — for a "Saved" tick that shows for a
 *  moment after a save, then gets out of the way. */
export const useFlash = (ms = 2000): [boolean, () => void] => {
    const [on, setOn] = useState(false);

    useEffect(() => {
        if (!on) return;
        const timer = setTimeout(() => setOn(false), ms);
        return () => clearTimeout(timer);
    }, [on, ms]);

    return [on, () => setOn(true)];
};
