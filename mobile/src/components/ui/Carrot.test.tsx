// Adapted from the web's src/components/ui/Carrot.test.tsx. The web sizes the
// mascot with a font-size class (`text-5xl`); here it is a number prop, and
// that is what the assertions look at.
//
// The mark is Apple's carrot as an asset, not the 🥕 character: the emoji font
// is Apple's only on Apple devices, and Android drew a different carrot. These
// assertions are what keep it a picture.
import { render, screen } from "@testing-library/react-native";
import { Carrot } from "@/components/ui/Carrot";

describe("Carrot", () => {
  it("draws the carrot artwork, labelled as an image", async () => {
    await render(<Carrot />);
    const el = screen.getByLabelText("carrot");
    expect(el.props.accessibilityRole).toBe("image");
    expect(el.props.source).toBeDefined();
  });

  it("ships the carrot as an asset rather than an emoji glyph", async () => {
    await render(<Carrot />);
    // A glyph would be text content; the mark must not depend on whichever
    // emoji font the device happens to have.
    expect(screen.getByLabelText("carrot")).not.toHaveTextContent("🥕");
  });

  it("defaults to the web's text-5xl, i.e. 48pt", async () => {
    await render(<Carrot />);
    expect(screen.getByLabelText("carrot")).toHaveStyle({ width: 48, height: 48 });
  });

  it("takes a custom size", async () => {
    await render(<Carrot size={60} />);
    expect(screen.getByLabelText("carrot")).toHaveStyle({ width: 60, height: 60 });
  });

  it("fits the artwork inside that box instead of stretching it", async () => {
    await render(<Carrot size={24} />);
    expect(screen.getByLabelText("carrot").props.resizeMode).toBe("contain");
  });

  it("accepts a className without disturbing the size", async () => {
    await render(<Carrot className="mb-2" size={12} />);
    const el = screen.getByLabelText("carrot");
    expect(el.props.className).toContain("mb-2");
    expect(el).toHaveStyle({ width: 12, height: 12 });
  });
});
