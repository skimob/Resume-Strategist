export const metadata = {
  title: "Resume Strategist",
  description: "AI-powered resume tailoring and career coaching",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0d0d0f" }}>
        {children}
      </body>
    </html>
  );
}
