import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useKeyboardInset } from "./useKeyboardInset";

const fakeViewport = (fields: {
    height: number;
    offsetTop?: number;
    scale?: number;
}) => {
    const viewport = Object.assign(new EventTarget(), {
        offsetTop: 0,
        scale: 1,
        ...fields,
    });
    vi.stubGlobal("visualViewport", viewport);
    return viewport;
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useKeyboardInset", () => {
    it("is zero where there's no visual viewport to read", () => {
        vi.stubGlobal("visualViewport", undefined);

        const { result } = renderHook(() => useKeyboardInset());

        expect(result.current).toBe(0);
    });

    it("follows the keyboard opening and closing", () => {
        const viewport = fakeViewport({ height: window.innerHeight });
        const { result } = renderHook(() => useKeyboardInset());
        expect(result.current).toBe(0);

        act(() => {
            viewport.height = window.innerHeight - 300;
            viewport.dispatchEvent(new Event("resize"));
        });
        expect(result.current).toBe(300);

        act(() => {
            viewport.height = window.innerHeight;
            viewport.dispatchEvent(new Event("resize"));
        });
        expect(result.current).toBe(0);
    });

    it("allows for the page having scrolled under the keyboard", () => {
        fakeViewport({ height: window.innerHeight - 300, offsetTop: 100 });

        const { result } = renderHook(() => useKeyboardInset());

        expect(result.current).toBe(200);
    });

    it("doesn't mistake pinch zoom for a keyboard", () => {
        fakeViewport({ height: window.innerHeight / 2, scale: 2 });

        const { result } = renderHook(() => useKeyboardInset());

        expect(result.current).toBe(0);
    });
});
