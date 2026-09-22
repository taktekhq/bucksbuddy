import Foundation

// Categories depend on direction: money IN uses a short income list, money OUT
// the fuller expense list. A combined lookup resolves label/icon/color for any
// stored id. Mirrors src/lib/categories.ts — the ids are what's stored in the
// database, so keep them stable and in step with the web app.
//
// A subcategory is an optional second level (Health → Pharmacy). It's stored
// inline as "parent/sub" in the transaction's `category` field.

struct Subcategory: Hashable, Identifiable, Sendable {
    let id: String
    let label: String
}

struct Category: Hashable, Identifiable, Sendable {
    let id: String
    let label: String
    /// SF Symbol name (the web app uses the lucide equivalent).
    let symbol: String
    /// Hex color from the Apple system palette.
    let colorHex: String
    var subcategories: [Subcategory] = []
}

enum Categories {
    static let income: [Category] = [
        .init(id: "salary", label: "Salary", symbol: "briefcase.fill", colorHex: "#34C759"),
        .init(id: "allowance", label: "Allowance", symbol: "wallet.pass.fill", colorHex: "#FF9500"),
        .init(id: "freelance", label: "Freelance", symbol: "laptopcomputer", colorHex: "#007AFF"),
        .init(id: "bonus", label: "Bonus", symbol: "rosette", colorHex: "#FF6482"),
        .init(id: "gift", label: "Gift", symbol: "gift.fill", colorHex: "#FF2D55"),
        .init(id: "family", label: "Family", symbol: "person.2.fill", colorHex: "#00C7BE"),
        .init(id: "rent_income", label: "Rent", symbol: "key.fill", colorHex: "#30B0C7"),
        .init(id: "investment", label: "Investment", symbol: "chart.line.uptrend.xyaxis", colorHex: "#5856D6"),
        .init(id: "savings", label: "Savings", symbol: "banknote.fill", colorHex: "#FFCC00"),
        .init(id: "cashback", label: "Cashback", symbol: "dollarsign.circle.fill", colorHex: "#32ADE6"),
        .init(id: "refund", label: "Refund", symbol: "arrow.uturn.backward", colorHex: "#AF52DE"),
        .init(id: "other", label: "Other", symbol: "ellipsis", colorHex: "#8E8E93"),
    ]

    // Ordered so the 3-column picker reads in tidy rows: food & drink, getting
    // around, personal, home & bills, social, then the catch-alls.
    static let expense: [Category] = [
        .init(id: "groceries", label: "Groceries", symbol: "cart.fill", colorHex: "#34C759", subcategories: [
            .init(id: "supermarket", label: "Supermarket"),
            .init(id: "mini_market", label: "Mini-market"),
            .init(id: "bakery", label: "Bakery"),
            .init(id: "butcher", label: "Butcher"),
            .init(id: "produce", label: "Produce"),
        ]),
        .init(id: "food", label: "Food", symbol: "fork.knife", colorHex: "#FF9500", subcategories: [
            .init(id: "restaurant", label: "Restaurant"),
            .init(id: "fast_food", label: "Fast Food"),
            .init(id: "delivery", label: "Delivery"),
            .init(id: "snacks", label: "Snacks"),
        ]),
        .init(id: "coffee", label: "Coffee", symbol: "cup.and.saucer.fill", colorHex: "#8B5E3C", subcategories: [
            .init(id: "cafe", label: "Café"),
            .init(id: "beans", label: "Beans"),
        ]),
        .init(id: "gas", label: "Gas", symbol: "fuelpump.fill", colorHex: "#FF3B30"),
        .init(id: "parking", label: "Parking", symbol: "parkingsign.circle.fill", colorHex: "#30B0C7"),
        .init(id: "transport", label: "Transport", symbol: "car.fill", colorHex: "#32ADE6", subcategories: [
            .init(id: "taxi", label: "Taxi"),
            .init(id: "bus", label: "Bus"),
            .init(id: "flight", label: "Flight"),
            .init(id: "service", label: "Service"),
            .init(id: "repairs", label: "Repairs"),
            .init(id: "wash", label: "Wash"),
            .init(id: "insurance", label: "Insurance"),
            .init(id: "registration", label: "Registration"),
        ]),
        .init(id: "shopping", label: "Shopping", symbol: "bag.fill", colorHex: "#A2845E", subcategories: [
            .init(id: "clothes", label: "Clothes"),
            .init(id: "electronics", label: "Electronics"),
            .init(id: "home", label: "Home"),
            .init(id: "beauty", label: "Beauty"),
        ]),
        .init(id: "self_care", label: "Self Care", symbol: "sparkles", colorHex: "#FF6482", subcategories: [
            .init(id: "hair", label: "Hair"),
            .init(id: "nails", label: "Nails"),
            .init(id: "eyebrows", label: "Eyebrows"),
            .init(id: "lashes", label: "Lashes"),
            .init(id: "skincare", label: "Skincare"),
            .init(id: "spa", label: "Spa"),
        ]),
        .init(id: "gym", label: "Gym", symbol: "dumbbell.fill", colorHex: "#007AFF"),
        .init(id: "health", label: "Health", symbol: "heart.fill", colorHex: "#FF375F", subcategories: [
            .init(id: "pharmacy", label: "Pharmacy"),
            .init(id: "doctor", label: "Doctor"),
            .init(id: "hospital", label: "Hospital"),
            .init(id: "dental", label: "Dental"),
            .init(id: "insurance", label: "Insurance"),
            .init(id: "lab", label: "Lab/Tests"),
        ]),
        .init(id: "fees", label: "Fees", symbol: "building.columns.fill", colorHex: "#AF52DE", subcategories: [
            .init(id: "mobile", label: "Mobile"),
            .init(id: "internet", label: "Internet"),
            .init(id: "bank", label: "Bank"),
            .init(id: "subscriptions", label: "Subscriptions"),
            .init(id: "utilities", label: "Utilities"),
        ]),
        .init(id: "rent", label: "Rent", symbol: "house.fill", colorHex: "#5856D6", subcategories: [
            .init(id: "airbnb", label: "Airbnb"),
        ]),
        .init(id: "fun", label: "Fun", symbol: "party.popper.fill", colorHex: "#F56300", subcategories: [
            .init(id: "movies", label: "Movies"),
            .init(id: "games", label: "Games"),
            .init(id: "events", label: "Events"),
            .init(id: "drinks", label: "Drinks"),
        ]),
        .init(id: "gifts", label: "Gifts", symbol: "gift.fill", colorHex: "#FF2D55", subcategories: [
            .init(id: "birthday", label: "Birthday"),
            .init(id: "wedding", label: "Wedding"),
            .init(id: "donation", label: "Donation"),
        ]),
        .init(id: "tips", label: "Tips", symbol: "dollarsign.square.fill", colorHex: "#FFCC00"),
        .init(id: "work", label: "Work", symbol: "briefcase.fill", colorHex: "#5856D6", subcategories: [
            .init(id: "subscriptions", label: "Subscriptions"),
            .init(id: "domains", label: "Domains"),
            .init(id: "hardware", label: "Hardware"),
            .init(id: "credits", label: "Credits"),
            .init(id: "services", label: "Services"),
        ]),
        .init(id: "family", label: "Family", symbol: "person.2.fill", colorHex: "#00C7BE"),
        .init(id: "other", label: "Other", symbol: "ellipsis", colorHex: "#8E8E93"),
    ]

    /// Moving cash to/from the Safe is a normal transaction with this
    /// category. Not offered in the picker — the Safe screen sets it.
    static let safeId = "safe"
    static let safe = Category(id: safeId, label: "Safe", symbol: "lock.shield.fill", colorHex: "#1FB85A")

    static func forDirection(isIncome: Bool) -> [Category] { isIncome ? income : expense }

    private static let byId: [String: Category] = {
        var map: [String: Category] = [:]
        for c in expense + income + [safe] where map[c.id] == nil { map[c.id] = c }
        return map
    }()

    /// Stored ids are "parent" or "parent/sub".
    static func split(_ stored: String) -> (base: String, sub: String?) {
        guard let i = stored.firstIndex(of: "/") else { return (stored, nil) }
        return (String(stored[..<i]), String(stored[stored.index(after: i)...]))
    }

    static func compose(_ base: String, _ sub: String?) -> String {
        if let sub, !sub.isEmpty { return "\(base)/\(sub)" }
        return base
    }

    static func subcategories(of base: String) -> [Subcategory] {
        byId[base]?.subcategories ?? []
    }

    static func subLabel(base: String, sub: String) -> String {
        byId[base]?.subcategories.first { $0.id == sub }?.label ?? sub
    }

    /// The subcategory label for a stored id, or nil when there's no sub.
    static func subLabel(_ stored: String) -> String? {
        let (base, sub) = split(stored)
        return sub.map { subLabel(base: base, sub: $0) }
    }

    /// "Food · Restaurant", or just "Food".
    static func label(_ stored: String) -> String {
        let (base, sub) = split(stored)
        let baseLabel = byId[base]?.label ?? base
        guard let sub else { return baseLabel }
        return "\(baseLabel) · \(subLabel(base: base, sub: sub))"
    }

    static func symbol(_ stored: String) -> String {
        byId[split(stored).base]?.symbol ?? "ellipsis"
    }

    static func colorHex(_ stored: String) -> String {
        byId[split(stored).base]?.colorHex ?? "#8E8E93"
    }

    static func isSafe(_ stored: String) -> Bool { split(stored).base == safeId }
}
