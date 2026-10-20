import "./globals.css";

export const metadata = {
  title: "MediVault",
  description: "Your health records, all in one place. One platform for patients, doctors, and pharmacies.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
