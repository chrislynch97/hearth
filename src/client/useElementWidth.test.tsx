import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useElementWidth } from "@/useElementWidth";

type Callback = (entries: Array<{ contentRect: { width: number } }>) => void;

const observers: Array<{ callback: Callback; disconnect: () => void }> = [];

class DrivenObserver {
    disconnect = vi.fn();
    constructor(public callback: Callback) {
        observers.push(this);
    }
    observe() {}
}

// The setup file's no-op observer never reports; swap in one the test drives.
const setupObserver = window.ResizeObserver;
beforeAll(() => {
    window.ResizeObserver = DrivenObserver as unknown as typeof ResizeObserver;
});
afterAll(() => {
    window.ResizeObserver = setupObserver;
});

const Probe = () => {
    const { ref, width } = useElementWidth<HTMLDivElement>();

    return <div ref={ref}>{width}</div>;
};

afterEach(() => {
    observers.length = 0;
});

describe("useElementWidth", () => {
    it("starts at zero and follows the element's width, rounded down", () => {
        render(<Probe />);
        expect(screen.getByText("0")).toBeTruthy();

        act(() => observers[0]?.callback([{ contentRect: { width: 312.7 } }]));
        expect(screen.getByText("312")).toBeTruthy();
    });

    it("stops observing when the element goes", () => {
        const { unmount } = render(<Probe />);
        unmount();
        expect(observers[0]?.disconnect).toHaveBeenCalled();
    });
});
