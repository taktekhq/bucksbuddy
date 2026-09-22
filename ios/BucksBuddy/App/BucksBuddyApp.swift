import Observation
import Supabase
import SwiftUI

@main
struct BucksBuddyApp: App {
    @State private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(Theme.carrot)
                .onOpenURL { url in
                    // OAuth callbacks that come back through the URL scheme
                    // rather than the in-app browser sheet.
                    supabase.auth.handle(url)
                }
        }
    }
}

/// Who's signed in. Owns the per-account `MoneyStore`, created fresh for each
/// user id so one account's data can never leak into another's screens.
@MainActor
@Observable
final class SessionModel {
    enum State {
        case loading
        case signedOut
        case signedIn(MoneyStore)
    }

    private(set) var state: State = .loading

    init() {
        Task { await listen() }
    }

    private func listen() async {
        for await (event, session) in supabase.auth.authStateChanges {
            switch event {
            case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                if let session, !(event == .initialSession && session.isExpired) {
                    signIn(userId: session.user.id.uuidString.lowercased(), email: session.user.email)
                } else if event == .initialSession {
                    state = .signedOut
                }
            case .signedOut:
                state = .signedOut
            default:
                break
            }
        }
    }

    private func signIn(userId: String, email: String?) {
        if case let .signedIn(store) = state, store.userId == userId { return }
        let store = MoneyStore(userId: userId, email: email)
        state = .signedIn(store)
        Task { await store.start() }
    }
}

struct RootView: View {
    @Environment(SessionModel.self) private var session

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ZStack {
                    Theme.canvas.ignoresSafeArea()
                    Carrot(size: 64)
                }
            case .signedOut:
                LandingView()
            case let .signedIn(store):
                MainView()
                    .environment(store)
                    .id(store.userId)
            }
        }
        .preferredColorScheme(.light)
    }
}

/// Every screen reachable from Home.
enum Route: Hashable {
    case history
    case recurring
    case stats
    case receipts(ReceiptsKind)
    case review
    case safe
    case settings
    case feedback
}

enum ReceiptsKind: String, Hashable {
    case treats, weekend
}

struct MainView: View {
    @Environment(MoneyStore.self) private var store
    @State private var path: [Route] = []

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(path: $path)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .history: HistoryView()
                    case .recurring: RecurringView()
                    case .stats: StatsView(path: $path)
                    case let .receipts(kind): ReceiptsView(kind: kind)
                    case .review: ReviewView()
                    case .safe: SafeView()
                    case .settings: SettingsView(path: $path)
                    case .feedback: FeedbackView()
                    }
                }
        }
    }
}
