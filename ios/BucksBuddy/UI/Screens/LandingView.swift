import Supabase
import SwiftUI

/// Signed-out entry point: the carrot, a line of voice, and the two ways in —
/// Google (the main one) and a quiet email + password for friends without it.
/// Accounts are the same Supabase accounts the web app uses.
struct LandingView: View {
    @State private var showEmail = false
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Field?

    enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                Spacer(minLength: 40)
                VStack(spacing: 14) {
                    Carrot(size: 72)
                    Text("BUCKSBUDDY")
                        .font(.display(30))
                        .foregroundStyle(Theme.labelMuted)
                    Text("What's up, Doc?")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Theme.labelSecondary)
                }

                VStack(alignment: .leading, spacing: 12) {
                    feature("plus.circle.fill", "Log money in or out in seconds.")
                    feature("chart.bar.fill", "See where it goes, month by month.")
                    feature("lock.shield.fill", "Amounts encrypted — end-to-end if you want.")
                    feature("globe", "Same account as bucksbuddy.com.")
                }
                .padding(.horizontal, 8)

                Card {
                    VStack(spacing: 12) {
                        if !AppConfig.isConfigured {
                            Text("This build has no Supabase key. Add it to ios/Config/Secrets.xcconfig (see ios/README.md).")
                                .font(.footnote)
                                .foregroundStyle(Theme.danger)
                        }

                        Button(action: google) {
                            HStack(spacing: 10) {
                                Image(systemName: "g.circle.fill").font(.system(size: 20))
                                Text(busy && !showEmail ? "Opening Google…" : "Continue with Google")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle(color: Theme.label))
                        .disabled(busy)

                        if showEmail {
                            VStack(spacing: 10) {
                                TextField("Email", text: $email)
                                    .textContentType(.emailAddress)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .focused($focused, equals: .email)
                                    .submitLabel(.next)
                                    .onSubmit { focused = .password }
                                    .modifier(FieldStyle())
                                SecureField("Password", text: $password)
                                    .textContentType(.password)
                                    .focused($focused, equals: .password)
                                    .submitLabel(.go)
                                    .onSubmit(signIn)
                                    .modifier(FieldStyle())
                                Button(busy ? "Signing in…" : "Sign in", action: signIn)
                                    .buttonStyle(PrimaryButtonStyle(enabled: canSignIn))
                                    .disabled(!canSignIn)
                            }
                        } else {
                            Button("Use email instead") {
                                withAnimation { showEmail = true }
                                focused = .email
                            }
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.carrot)
                            .padding(.top, 4)
                        }

                        if let error {
                            Text(error)
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(Theme.danger)
                                .multilineTextAlignment(.center)
                        }
                    }
                }

                HStack(spacing: 16) {
                    Link("Privacy & terms", destination: AppConfig.webURL.appending(path: "privacy"))
                    Link("Contact", destination: URL(string: "mailto:\(AppConfig.contactEmail)")!)
                }
                .font(.footnote)
                .foregroundStyle(Theme.labelSecondary)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas.ignoresSafeArea())
    }

    private var canSignIn: Bool { !busy && !email.isEmpty && !password.isEmpty }

    private func feature(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .foregroundStyle(Theme.carrot)
                .frame(width: 24)
            Text(text).foregroundStyle(Theme.label)
        }
        .font(.system(size: 15))
    }

    private func google() {
        busy = true
        error = nil
        Task {
            do {
                _ = try await supabase.auth.signInWithOAuth(provider: .google, redirectTo: AppConfig.authRedirect)
            } catch {
                // Closing the sheet isn't an error worth shouting about.
                if (error as NSError).code != 1 { self.error = error.localizedDescription }
            }
            busy = false
        }
    }

    private func signIn() {
        guard canSignIn else { return }
        busy = true
        error = nil
        Task {
            do {
                _ = try await supabase.auth.signIn(
                    email: email.trimmingCharacters(in: .whitespaces), password: password)
            } catch {
                self.error = "That email and password don't match."
            }
            busy = false
        }
    }
}

/// Light rounded input on a white card.
struct FieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 17))
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .background(Theme.canvas, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
