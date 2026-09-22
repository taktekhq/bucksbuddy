import UIKit

/// A printable statement: title, what it covers, totals, and the table of
/// entries — drawn with UIKit's PDF renderer (the web app hand-assembles the
/// same thing in src/lib/pdf.ts).
enum PDFStatement {
    private static let pageSize = CGSize(width: 595, height: 842) // A4 in points
    private static let margin: CGFloat = 40
    private static let rowHeight: CGFloat = 16

    private struct Column {
        let head: String
        let width: CGFloat
        var right = false
    }

    private static let columns: [Column] = [
        .init(head: "Date", width: 62),
        .init(head: "Type", width: 30),
        .init(head: "Category", width: 125),
        .init(head: "Original", width: 90, right: true),
        .init(head: "Amount", width: 80, right: true),
        .init(head: "Note", width: 128),
    ]

    static func render(rows: [Transaction], homeCurrency: String, rangeLabel: String, now: Date = Date()) -> Data {
        let carrot = UIColor(red: 245 / 255, green: 99 / 255, blue: 0, alpha: 1)
        let label = UIColor(red: 28 / 255, green: 28 / 255, blue: 30 / 255, alpha: 1)
        let muted = UIColor(red: 142 / 255, green: 142 / 255, blue: 147 / 255, alpha: 1)
        let income = UIColor(red: 52 / 255, green: 199 / 255, blue: 89 / 255, alpha: 1)
        let expense = UIColor(red: 1, green: 59 / 255, blue: 48 / 255, alpha: 1)
        let zebra = UIColor(red: 242 / 255, green: 242 / 255, blue: 247 / 255, alpha: 1)

        let body = UIFont.systemFont(ofSize: 8.5)
        let bold = UIFont.boldSystemFont(ofSize: 8.5)
        let sorted = rows.sorted { $0.occurredAt > $1.occurredAt }
        let spent = sorted.filter(Stats.isSpending).reduce(0) { $0 + $1.amountCents }
        let inflow = sorted.filter { $0.isIncome && !Categories.isSafe($0.category) }.reduce(0) { $0 + $1.amountCents }

        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: pageSize))
        return renderer.pdfData { ctx in
            var y: CGFloat = 0
            var page = 0

            func draw(_ s: String, x: CGFloat, y: CGFloat, width: CGFloat, font: UIFont,
                      color: UIColor, right: Bool = false) {
                let style = NSMutableParagraphStyle()
                style.alignment = right ? .right : .left
                style.lineBreakMode = .byTruncatingTail
                (s as NSString).draw(
                    in: CGRect(x: x, y: y, width: width, height: rowHeight),
                    withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
            }

            func header() {
                var x = margin
                for c in columns {
                    draw(c.head.uppercased(), x: x + 3, y: y, width: c.width - 6, font: bold, color: muted, right: c.right)
                    x += c.width
                }
                y += rowHeight
                muted.withAlphaComponent(0.4).setFill()
                UIRectFill(CGRect(x: margin, y: y - 2, width: pageSize.width - 2 * margin, height: 0.5))
            }

            func newPage() {
                ctx.beginPage()
                page += 1
                y = margin
                if page == 1 {
                    draw("BucksBuddy 🥕", x: margin, y: y, width: 300,
                         font: .systemFont(ofSize: 20, weight: .heavy), color: carrot)
                    y += 28
                    draw("Statement · \(rangeLabel)", x: margin, y: y, width: 500,
                         font: .systemFont(ofSize: 11, weight: .semibold), color: label)
                    y += 16
                    draw("Amounts in \(homeCurrency) · generated \(Dates.shortDayYearFormatter.string(from: now))",
                         x: margin, y: y, width: 500, font: body, color: muted)
                    y += 22
                    let summary = [("In", Money.format(inflow, homeCurrency, useCode: true), income),
                                   ("Spent", Money.format(spent, homeCurrency, useCode: true), expense),
                                   ("Net", Money.formatSigned(netCents(sorted), homeCurrency, useCode: true), label),
                                   ("Entries", "\(sorted.count)", label)]
                    var x = margin
                    for (title, value, color) in summary {
                        draw(title.uppercased(), x: x, y: y, width: 120, font: bold, color: muted)
                        draw(value, x: x, y: y + 12, width: 120, font: .monospacedDigitSystemFont(ofSize: 12, weight: .bold), color: color)
                        x += 128
                    }
                    y += 40
                }
                header()
            }

            newPage()
            for (i, r) in sorted.enumerated() {
                if y + rowHeight > pageSize.height - margin {
                    draw("Page \(page)", x: margin, y: pageSize.height - margin + 10, width: 100, font: body, color: muted)
                    newPage()
                }
                if i % 2 == 1 {
                    zebra.setFill()
                    UIRectFill(CGRect(x: margin, y: y - 2, width: pageSize.width - 2 * margin, height: rowHeight))
                }
                let original = r.originalCurrency == homeCurrency ? ""
                    : "\(Money.formatPlain(r.originalAmount, decimals: Currencies.info(r.originalCurrency).decimals)) \(r.originalCurrency)"
                let cells: [(String, UIColor)] = [
                    (Dates.shortDayYearFormatter.string(from: r.occurredAt), label),
                    (r.isIncome ? "In" : "Out", r.isIncome ? income : expense),
                    (Categories.label(r.category), label),
                    (original, muted),
                    ((r.isIncome ? "+" : "-") + Money.format(r.amountCents, homeCurrency, useCode: true),
                     r.isIncome ? income : expense),
                    (r.note ?? "", muted),
                ]
                var x = margin
                for (c, cell) in zip(columns, cells) {
                    draw(cell.0, x: x + 3, y: y, width: c.width - 6, font: body, color: cell.1, right: c.right)
                    x += c.width
                }
                y += rowHeight
            }
            if sorted.isEmpty {
                draw("Nothin' logged in this range, Doc.", x: margin, y: y + 4, width: 400, font: body, color: muted)
            }
            draw("Page \(page)", x: margin, y: pageSize.height - margin + 10, width: 100, font: body, color: muted)
        }
    }
}
