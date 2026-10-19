import "./globals.css";

export const metadata = {
  title: "MediVault",
  description: "Blockchain-backed EHR — patient and admin portals",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
