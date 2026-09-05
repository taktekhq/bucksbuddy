import { Platform, StyleSheet, type TextInput } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { Input } from "@/components/ui/Input";

// The wrapper exists to correct two platform quirks that push text off-centre
// inside a field (see the comment in Input.tsx). Both are asserted here
// because neither is visible in a snapshot of the app's own screens.
function flatten(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

describe("Input", () => {
  it("centres the text vertically", async () => {
    await render(<Input accessibilityLabel="Amount" />);
    expect(screen.getByLabelText("Amount").props.textAlignVertical).toBe("center");
  });

  it("passes props and styles through to the field", async () => {
    await render(
      <Input accessibilityLabel="Note" placeholder="Add a note" style={{ opacity: 0.5 }} />,
    );
    const field = screen.getByLabelText("Note");
    expect(field.props.placeholder).toBe("Add a note");
    expect(flatten(field.props.style).opacity).toBe(0.5);
  });

  it("drops Android's extra font padding, which shifts short text down", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      await render(<Input accessibilityLabel="Passphrase" />);
      expect(flatten(screen.getByLabelText("Passphrase").props.style).includeFontPadding).toBe(
        false,
      );
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    }
  });

  it("leaves font padding alone on iOS, which has no such quirk", async () => {
    await render(<Input accessibilityLabel="Rate" />);
    expect(
      flatten(screen.getByLabelText("Rate").props.style).includeFontPadding,
    ).toBeUndefined();
  });

  it("forwards a ref so a field can move focus to the next one", async () => {
    const ref = { current: null as TextInput | null };
    await render(<Input ref={ref} accessibilityLabel="Email" />);
    expect(ref.current).not.toBeNull();
  });
});
