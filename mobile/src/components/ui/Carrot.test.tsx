// Adapted from the web's src/components/ui/Carrot.test.tsx. The web sizes the
// emoji with a font-size class (`text-5xl`); a React Native Text can only be
// sized through its fontSize, so the size is a number prop here and that is
// what the assertions look at.
import { render, screen } from "@testing-library/react-native";
import { Carrot } from "@/components/ui/Carrot";

describe("Carrot", () => {
  it("renders the carrot emoji, labelled as an image", async () => {
    await render(<Carrot />);
    const el = screen.getByLabelText("carrot");
    expect(el).toHaveTextContent("🥕");
    expect(el.props.accessibilityRole).toBe("image");
  });

  it("defaults to the web's text-5xl, i.e. 48pt", async () => {
    await render(<Carrot />);
    expect(screen.getByLabelText("carrot")).toHaveStyle({ fontSize: 48 });
  });

  it("takes a custom size", async () => {
    await render(<Carrot size={60} />);
    expect(screen.getByLabelText("carrot")).toHaveStyle({ fontSize: 60 });
  });

  it("gives the glyph 1.15x of headroom so its top isn't clipped", async () => {
    await render(<Carrot size={24} />);
    // 24 * 1.15 = 27.6 → 28. `leading-none` (lineHeight === fontSize) clips the
    // color emoji, which overhangs its em box.
    expect(screen.getByLabelText("carrot")).toHaveStyle({ lineHeight: 28 });
  });

  it("does not scale with the OS font size setting", async () => {
    await render(<Carrot />);
    expect(screen.getByLabelText("carrot").props.allowFontScaling).toBe(false);
  });

  it("accepts a className without disturbing the emoji", async () => {
    await render(<Carrot className="mb-2" size={12} />);
    const el = screen.getByLabelText("carrot");
    expect(el).toHaveTextContent("🥕");
    expect(el).toHaveStyle({ fontSize: 12 });
  });
});
