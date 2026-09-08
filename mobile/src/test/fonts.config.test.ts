// How Grobold is handed to each platform, and why Android needs its own form.
//
// THE BUG THIS EXISTS FOR
//
// The display font was listed once, as a plain file path, which the expo-font
// plugin copies to `assets/fonts/Grobold.ttf` for both platforms. iOS reads the
// family name out of the file and is done. Android is not: with a family name
// set, React Native asks ReactFontManager for it, and ReactFontManager collapses
// the weight to Typeface's two-bit style and then looks for a FILE PER STYLE —
// `Grobold_bold.ttf` for anything at weight 700 or above. There is no such
// file, so it fell through to `Typeface.create("Grobold", BOLD)`, and Android,
// having no system family by that name, handed back Roboto Bold.
//
// Every `font-display font-bold` in the app — the wordmark, Home's header, the
// month switcher, the timeline, the Safe — was therefore drawn in Roboto on
// Android. Not the wrong weight of the right font: the wrong font.
//
// The fix is the plugin's Android XML form (`fontFamily` + `fontDefinitions`),
// which registers the family through `ReactFontManager.addCustomFont` — a cache
// checked BEFORE the per-style file lookup, so every weight resolves to the one
// real face. The 700 definition is the load-bearing one: it is the weight the
// app asks for, and declaring it also stops Android synthesising a fake bold on
// top (minikin fakes one once the asked-for weight is 200 past the face's, and
// this face declares 500).
//
// Asserting on the config rather than on the plugin's output keeps this test
// free of `expo/config-plugins`, which is ESM and does not load under jest.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require("../../app.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tailwindConfig = require("../../tailwind.config.js");

type FontDefinition = { path: string; weight: number; style?: string };
type FontObject = { fontFamily: string; fontDefinitions: FontDefinition[] };
type FontProps = {
  fonts?: string[];
  android?: { fonts?: (string | FontObject)[] };
  ios?: { fonts?: string[] };
};

const FAMILY = "Grobold";
const FILE = "./assets/fonts/Grobold.ttf";

const props: FontProps = appJson.expo.plugins.find(
  (p: unknown) => Array.isArray(p) && p[0] === "expo-font",
)[1];

// The plugin concatenates the shared list with the per-platform one, so this is
// what each platform actually receives.
const androidFonts = [...(props.fonts ?? []), ...(props.android?.fonts ?? [])];
const iosFonts = [...(props.fonts ?? []), ...(props.ios?.fonts ?? [])];

describe("the display font on Android", () => {
  const objects = androidFonts.filter((f): f is FontObject => typeof f === "object");

  it("is registered as a family, not left to the per-style file lookup", () => {
    // A bare string here is the old, broken form: it only copies the file.
    expect(androidFonts.filter((f) => typeof f === "string")).toEqual([]);
    expect(objects.map((f) => f.fontFamily)).toEqual([FAMILY]);
  });

  it("declares a 700 face, which is the weight the app actually asks for", () => {
    const definitions = objects[0].fontDefinitions;
    expect(definitions.map((d) => d.weight)).toEqual(expect.arrayContaining([700]));
    // 400 as well, so no weight in the app is far enough from a declared face
    // for Android to synthesise a bold over it.
    expect(definitions.map((d) => d.weight)).toEqual(expect.arrayContaining([400]));
    expect(definitions.every((d) => d.path === FILE)).toBe(true);
  });
});

describe("the display font on iOS", () => {
  it("stays a plain file link, which is all iOS needs", () => {
    expect(iosFonts).toEqual([FILE]);
  });
});

describe("the family name", () => {
  // Three places have to agree on the string, and a mismatch is silent: the
  // family does not resolve and the platform quietly substitutes its own font.
  it("is the one the stylesheet asks for", () => {
    expect(tailwindConfig.theme.extend.fontFamily.display).toEqual([FAMILY]);
  });

  it("is the one the app loads at runtime", () => {
    const app = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");
    expect(app).toContain(`${FAMILY}: require("../assets/fonts/Grobold.ttf")`);
  });
});
