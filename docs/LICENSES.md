# Third-party license ledger

The Windows package contains the Electron and Chromium notices beside its executable, and includes the generated [third-party notices](../apps/desktop/THIRD-PARTY-NOTICES.txt) in its `resources` directory. That file collects license metadata and published license files for all runtime packages and bundled renderer dependencies.

| Package                                                     | Version | Use                                                                             | License                        |
| ----------------------------------------------------------- | ------: | ------------------------------------------------------------------------------- | ------------------------------ |
| Electron                                                    |  44.5.1 | Windows desktop runtime; notice files ship with the app                         | MIT; Chromium notices included |
| `@soundtouchjs/audio-worklet` and its core/worklet packages |   2.1.1 | Renderer tempo and pitch worklet; unmodified source retained in the app archive | MPL-2.0                        |
| `music-metadata`                                            | 11.16.1 | Read local audio tags, duration, and artwork                                    | MIT                            |
| React / React DOM                                           |  19.3.0 | Bundled renderer                                                                | MIT                            |
| `lucide-react`                                              |  1.49.0 | Bundled renderer icons                                                          | ISC                            |
| `electron-builder`                                          | 26.15.3 | Build-time Windows installer tool; not shipped as an app dependency             | MIT                            |

Other runtime transitive dependencies and their exact locked versions are listed in the generated notice file. Rebuild it with `npm run licenses` after dependency changes. The generator walks the production dependency graph and the renderer's bundled package roots using `package-lock.json`; it copies available upstream license files and flags packages whose published npm archive contains no standalone license text.

This ledger describes the locked local build. It is not a substitute for reviewing package changes before distributing a new release. Do not add fingerprinting binaries, ffmpeg, or packages with unreviewed terms to the shipping app.
