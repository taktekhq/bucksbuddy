import SwiftUI

// The design system (docs/DESIGN_SYSTEM.md): "An Apple app, hijacked by Bugs
// Bunny." A plain grouped-iOS base, one loud carrot accent, the Grobold
// cartoon face on grey section headers only, SF Pro Rounded for every digit
// of money, and money that's allowed to be green & red.

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let hasAlpha = s.count == 8
        let r = Double((v >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
        let g = Double((v >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
        let b = Double((v >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
        let a = hasAlpha ? Double(v & 0xFF) / 255 : 1
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

enum Theme {
    // Canvas & surfaces (light-first; the dark rooms are their own palettes).
    static let canvas = Color(hex: "#F2F2F7")
    static let surface = Color.white
    static let grouped = Color(hex: "#E9E9EF")
    static let label = Color(hex: "#1C1C1E")
    static let labelMuted = Color(hex: "#48484A")
    static let labelSecondary = Color(hex: "#8E8E93")
    static let separator = Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255, opacity: 0.12)

    // THE accent.
    static let carrot = Color(hex: "#F56300")
    static let carrotLight = Color(hex: "#FF8A3D")
    static let carrotSoft = Color(hex: "#FFF1E6")
    static let carrotDark = Color(hex: "#C44E00")

    // Money.
    static let income = Color(hex: "#34C759")
    static let expense = Color(hex: "#FF3B30")
    static let danger = Color(hex: "#FF3B30")
    static let goldInk = Color(hex: "#A16207")

    // The Safe: a green vault with gold.
    enum Vault {
        static let top = Color(hex: "#0E4A37")
        static let mid = Color(hex: "#0A3A2A")
        static let floor = Color(hex: "#06281E")
        static let gold = Color(hex: "#FFD479")
        static let mint = Color(hex: "#7CE6AA")
        static let take = Color(hex: "#E0631A")
        static let add = Color(hex: "#1FB85A")
        static var background: LinearGradient {
            LinearGradient(colors: [top, mid, floor], startPoint: .top, endPoint: .bottom)
        }
    }

    // Stats, Recurring, Receipts: the observatory indigo.
    enum Night {
        static let top = Color(hex: "#23234A")
        static let floor = Color(hex: "#141428")
        static var background: LinearGradient {
            LinearGradient(colors: [top, floor], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.6))
        }
    }

    // The review: a calm blue, the one hue the app hasn't already spent.
    enum Review {
        static let top = Color(hex: "#123A56")
        static let mid = Color(hex: "#0D2C42")
        static let ink = Color(hex: "#0A2233")
        static let card = Color(hex: "#10314A")
        static let tile = Color(hex: "#17415E")
        static let text = Color(hex: "#F2F7FB")
        static let muted = Color(hex: "#A8C2D8")
        /// Charts in the review are coloured by RANK, never by category.
        static let ramp: [Color] = ["#FF8A3D", "#5AC8FA", "#FFD479", "#BF9CFF", "#7CE6AA"].map { Color(hex: $0) }
        static var background: LinearGradient {
            LinearGradient(colors: [top, mid, ink], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.5))
        }
    }

    static let cardRadius: CGFloat = 20

    static func netColor(_ cents: Int) -> Color {
        cents > 0 ? income : cents < 0 ? expense : label
    }

    static func amountColor(isIncome: Bool) -> Color { isIncome ? income : expense }

    static func categoryColor(_ stored: String) -> Color { Color(hex: Categories.colorHex(stored)) }
}

extension Font {
    /// Grobold, the cartoon face — grey section headers and the wordmark only,
    /// always uppercase. Falls back to SF Rounded if the font isn't bundled.
    static func display(_ size: CGFloat) -> Font {
        if UIFont(name: "GROBOLD", size: size) != nil { return .custom("GROBOLD", size: size) }
        return .system(size: size, weight: .heavy, design: .rounded)
    }

    /// SF Pro Rounded with tabular figures — every digit of money.
    static func numeric(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}

// MARK: - Building blocks

/// Grey Grobold header sitting above a card ("History", "What's up, Doc?").
struct SectionHeader: View {
    let title: String
    var color: Color = Theme.labelMuted
    init(_ title: String, color: Color = Theme.labelMuted) {
        self.title = title
        self.color = color
    }
    var body: some View {
        Text(title.uppercased())
            .font(.display(15))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// White card on the grouped canvas, with the soft iOS elevation.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}

/// A card for the dark rooms: faint white fill and a hairline, not a shadow.
struct DarkCard<Content: View>: View {
    var padding: CGFloat = 16
    var fill: Color = .white.opacity(0.07)
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .strokeBorder(.white.opacity(0.1), lineWidth: 1)
            )
    }
}

/// The carrot pill: primary action.
struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = Theme.carrot
    var foreground: Color = .white
    var enabled: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(enabled ? foreground : Theme.labelSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(enabled ? color : Theme.separator, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The gentle press used on tappable cards and icons.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A category's icon in its color chip.
struct CategoryIcon: View {
    let category: String
    var size: CGFloat = 40
    var body: some View {
        Image(systemName: Categories.symbol(category))
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Theme.categoryColor(category), in: Circle())
    }
}

/// The mascot. It sits still — the carrot never animates.
struct Carrot: View {
    var size: CGFloat = 24
    var body: some View { Text("🥕").font(.system(size: size)) }
}

/// "BUCKS / BUDDY", stacked.
struct Wordmark: View {
    var size: CGFloat = 13
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("BUCKS")
            Text("BUDDY")
        }
        .font(.display(size))
        .foregroundStyle(Theme.labelMuted)
    }
}

/// The big hero number: green up, red down, masked when locked.
struct NetTotal: View {
    let cents: Int
    let label: String
    let currency: String
    var masked = false
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Theme.labelSecondary)
            Text(masked ? Money.formatMasked("•••••", currency) : Money.formatSigned(cents, currency))
                .font(.numeric(44, weight: .heavy))
                .foregroundStyle(masked ? Theme.labelSecondary : Theme.netColor(cents))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .contentTransition(.numericText())
        }
    }
}

/// A two-option segmented pill (In/Out, Cash/Gold, Monthly/Yearly).
struct PillToggle<T: Hashable>: View {
    let options: [(value: T, label: String, symbol: String?)]
    @Binding var selection: T
    var activeFill: (T) -> Color = { _ in .white }
    var activeText: (T) -> Color = { _ in Theme.label }
    var inactiveText: Color = Theme.labelSecondary
    var track: Color = Theme.grouped

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options.indices, id: \.self) { i in
                let opt = options[i]
                let active = opt.value == selection
                Button {
                    withAnimation(.snappy(duration: 0.2)) { selection = opt.value }
                } label: {
                    HStack(spacing: 6) {
                        if let symbol = opt.symbol { Image(systemName: symbol) }
                        Text(opt.label)
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(active ? activeText(opt.value) : inactiveText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background {
                        if active {
                            Capsule().fill(activeFill(opt.value)).shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(track, in: Capsule())
    }
}

extension View {
    /// Full-bleed background that never flashes the canvas on overscroll.
    func roomBackground<S: ShapeStyle>(_ style: S, floor: Color) -> some View {
        background { ZStack { floor; Rectangle().fill(style) }.ignoresSafeArea() }
    }
}
