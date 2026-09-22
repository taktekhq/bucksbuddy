import PhotosUI
import Supabase
import SwiftUI

/// Report a bug or share an idea: files a GitHub issue through the
/// `feedback` edge function, exactly like the web app (src/lib/feedback.ts).
/// Screenshots upload straight to the private `feedback` bucket under
/// `<user id>/<ticket>/`; the account's raw data only rides along when the
/// toggle — off by default — is turned on.
struct FeedbackView: View {
    @Environment(MoneyStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    static let maxScreenshots = 4
    static let maxBytes = 5 * 1024 * 1024
    static let maxChars = 4000

    @State private var message = ""
    @State private var picks: [PhotosPickerItem] = []
    @State private var shots: [UIImage] = []
    @State private var includeData = false
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false

    private var valuesMasked: Bool {
        store.locked || store.transactions.contains(where: \.isMasked)
            || store.safeGoldEntries.contains { $0.gramsMask != nil }
    }

    var body: some View {
        Form {
            if sent {
                Section {
                    VStack(spacing: 12) {
                        Carrot(size: 48)
                        Text("Thanks, Doc!").font(.title3.weight(.bold))
                        Text("Your report is filed. We'll reply to \(store.email ?? "your account email") if we need more.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Theme.labelSecondary)
                        Button("Done") { dismiss() }
                            .buttonStyle(PrimaryButtonStyle())
                            .padding(.top, 8)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
            } else {
                Section {
                    TextField("What happened, or what would make it better?", text: $message, axis: .vertical)
                        .lineLimit(5...12)
                } header: {
                    SectionHeader("Feedback").padding(.horizontal, -8)
                } footer: {
                    Text("Sent as a GitHub issue. We reply to \(store.email ?? "your account email").")
                }

                Section {
                    if !shots.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(shots.indices, id: \.self) { i in
                                    Image(uiImage: shots[i])
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 72, height: 110)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                        .overlay(alignment: .topTrailing) {
                                            Button {
                                                shots.remove(at: i)
                                            } label: {
                                                Image(systemName: "xmark.circle.fill")
                                                    .symbolRenderingMode(.palette)
                                                    .foregroundStyle(.white, .black.opacity(0.6))
                                            }
                                            .buttonStyle(.borderless)
                                            .padding(4)
                                        }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    PhotosPicker(selection: $picks, maxSelectionCount: max(1, Self.maxScreenshots - shots.count),
                                 matching: .images) {
                        Label(shots.isEmpty ? "Add screenshots" : "Add more", systemImage: "photo.on.rectangle.angled")
                    }
                    .disabled(shots.count >= Self.maxScreenshots)
                } footer: {
                    Text("Up to \(Self.maxScreenshots).")
                }

                Section {
                    Toggle("Include my account data", isOn: $includeData)
                        .tint(Theme.carrot)
                        .disabled(valuesMasked)
                } footer: {
                    Text(valuesMasked
                         ? "Unlock first — while locked the values here are stand-ins, and sending them would be worse than nothing."
                         : includeData
                         ? "Your raw entries (amounts, notes, dates, settings) are sent with this report, used only to fix the bug, and deleted once it's fixed."
                         : "Off: only your message, screenshots and device model are sent.")
                }

                Section {
                    Button(action: send) {
                        Text(sending ? "Sending…" : "Send")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                    .disabled(sending || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(Theme.danger)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas.ignoresSafeArea())
        .navigationTitle("Feedback")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: picks) { _, items in
            Task {
                for item in items {
                    if shots.count >= Self.maxScreenshots { break }
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        shots.append(image)
                    }
                }
                picks = []
            }
        }
    }

    // MARK: Sending

    private struct Payload: Encodable, Sendable {
        let message: String
        let screenshots: [String]
        let dataPath: String?
        let device: [String: String]
    }

    private func send() {
        sending = true
        error = nil
        let text = String(message.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.maxChars))
        let images = shots
        let data = includeData && !valuesMasked ? snapshot() : nil
        Task {
            let failure = await submit(text: text, images: images, data: data)
            sending = false
            if let failure { error = failure } else { sent = true }
        }
    }

    private func submit(text: String, images: [UIImage], data: Data?) async -> String? {
        let bucket = supabase.storage.from("feedback")
        let ticket = (0..<8).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
        let folder = "\(store.userId)/\(ticket)"
        var uploaded: [String] = []

        func abort() async -> String {
            if !uploaded.isEmpty { _ = try? await bucket.remove(paths: uploaded) }
            return "Couldn't send that. Check your connection and try again."
        }

        do {
            for (i, image) in images.enumerated() {
                guard let jpeg = Self.jpeg(image) else { continue }
                let path = "\(folder)/shot-\(i + 1).jpg"
                _ = try await bucket.upload(path, data: jpeg, options: FileOptions(contentType: "image/jpeg", upsert: false))
                uploaded.append(path)
            }
            let shotPaths = uploaded
            var dataPath: String?
            if let data {
                let path = "\(folder)/account-data.json"
                _ = try await bucket.upload(path, data: data, options: FileOptions(contentType: "application/json", upsert: false))
                uploaded.append(path)
                dataPath = path
            }
            let device = UIDevice.current
            let screen = UIScreen.main.bounds.size
            try await supabase.functions.invoke("feedback", options: FunctionInvokeOptions(body: Payload(
                message: text, screenshots: shotPaths, dataPath: dataPath,
                device: [
                    "user_agent": "BucksBuddy iOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") · \(device.model) · \(device.systemName) \(device.systemVersion)",
                    "language": Locale.preferredLanguages.first ?? "",
                    "timezone": TimeZone.current.identifier,
                    "viewport": "\(Int(screen.width))×\(Int(screen.height))",
                    "standalone": "native",
                ]
            )))
            return nil
        } catch {
            return await abort()
        }
    }

    /// JPEG, shrunk until it fits the bucket's 5 MB limit.
    private static func jpeg(_ image: UIImage) -> Data? {
        var current = image
        for _ in 0..<5 {
            if let data = current.jpegData(compressionQuality: 0.8), data.count <= maxBytes { return data }
            let size = CGSize(width: current.size.width * 0.7, height: current.size.height * 0.7)
            current = UIGraphicsImageRenderer(size: size).image { _ in current.draw(in: CGRect(origin: .zero, size: size)) }
        }
        return nil
    }

    /// The decrypted account, as the app holds it — only built when the
    /// reporter turned the toggle on.
    private func snapshot() -> Data? {
        struct Settings: Encodable { let home_currency: String; let currencies: [CurrencyRate]; let encryption: String }
        struct Account: Encodable { let user_id: String; let email: String? }
        struct Dump: Encodable {
            let taken_at: String
            let account: Account
            let settings: Settings
            let transactions: [Transaction]
            let gold_entries: [SafeGoldEntry]
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try? encoder.encode(Dump(
            taken_at: Dates.isoString(Date()),
            account: Account(user_id: store.userId, email: store.email),
            settings: Settings(home_currency: store.homeCurrency, currencies: store.currencies,
                               encryption: store.e2eMode.rawValue),
            transactions: store.transactions,
            gold_entries: store.safeGoldEntries
        ))
    }
}
