# Memorator - Messenger, WhatsApp and SMS Chat Viewer and Exporter

*"In the memory of those who departed"*

Memorator is a client-side, purely browser-based tool designed to parse, combine, view, and  export your personal chat histories into sleek PDFs (Ebooks) or  text scripts. 

By analyzing data entirely in your own browser using advanced `JSZip` handling and `jsPDF` renderers, your private conversations never leave your local machine. This tool is built specifically to preserve the precious legacy of conversations that matter most.

## Features
- **Total Privacy:** 100% offline parsing. No server uploads.
- **Universal Support:** Instantly parses Messenger (HTML/JSON), WhatsApp (TXT/ZIP), and SMS (JSON/NDJSON) and merges them into a unified, chronological layout.
- **PDF Ebook Generator:** Generates beautiful, styled, printable PDF conversation books featuring dynamic tables of contents, sender coloring, message timestamps, and deep cross-platform integration.
- **Advanced UX:** Group participant exclusion, smart aliases mapping, auto-detecting timestamps, duplicate checking, and leaderboard.
- **Data Caching:** Save and load massive browser-state snapshots via IndexedDB instantly.

## How to Get Your Data

### Meta Messenger
Go to your Meta Accounts Centre and request to "Download your information". Select Messages and choose HTML format. You can drag the resulting folders into this tool. You can grab the E2EE Messenger data (ZIP/JSON) from Facebook Desktop. Or use this link. https://www.facebook.com/secure_storage/dyi

### WhatsApp
Open the desired chat on your mobile device, tap the three dots or contact name, and select "Export Chat". You can upload the generated `.zip` archive or the inner `.txt` file directly into this app. The app automatically extracts the `.zip` content entirely locally inside your browser memory.

### SMS Data
To extract SMS conversations from an Android device, we strongly endorse the free and highly reliable FOSS application **SMS Import and Export**. 
You can download it securely from F-Droid: [https://f-droid.org/packages/com.github.tmo1.sms_ie/](https://f-droid.org/packages/com.github.tmo1.sms_ie/). Load the exported JSON files right into Memorator. 

## Getting Started Locally
1. Clone the repository.
2. Run `npm install` to install local dependencies (`jszip`, `jspdf`, `mammoth`, etc.).
3. Run `npm start` to spin up the local development server on Port 3000.
4. Upload your chat dumps and generate your books!
