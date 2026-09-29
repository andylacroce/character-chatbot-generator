/**
 * Explicit source-work/tradition grounding for EVERY entry in `gameCharacterNames.ts` —
 * not just the ones a live incident happened to reveal as ambiguous. Keyed by the exact
 * name string as it appears there (including any disambiguating "(...)" suffix already
 * baked into that string).
 *
 * This exists because the game's only historical source of truth for "who is this
 * character" was a bare name string, independently re-derived by Claude in both
 * clue-generation and guess-classification — and every one of a long run of incidents
 * (Hero, Beauty, David Copperfield, The Emperor, The Knight, The Monster, Scarecrow/Tin
 * Man/Cowardly Lion, plus the classifier near-misses: Edward/Edmund, Hamlet/Laertes,
 * Beauty/Cleopatra, Venus/Aphrodite) came from that same root cause. Patching one
 * disambiguating suffix at a time as each incident surfaced live was reactive and
 * incomplete by construction. This map is the structural fix: `work` is required for
 * every entry, threaded into `generateGameCluePersonaPrompt` (src/config/serverConfig.ts)
 * for the hidden `nextCharacterName` and into `classifyGuess`'s (src/pages/api/guess-who-next/
 * message.ts) correctness judgment for both names, so the game's prompts never have to
 * guess at identity from a name string alone. `tests/src/data/gameCharacterWork.test.ts`
 * enforces completeness: every entry in `gameCharacterNames` must have a key here, and
 * every key here must exist verbatim in `gameCharacterNames` — so a newly added game
 * character can't silently ship without this grounding.
 *
 * `work` is deliberately short and concrete: the specific work of fiction for a
 * fictional character (e.g. "The Wizard of Oz", "Hamlet"), or the specific mythology/
 * historical tradition for a real or mythological figure (e.g. "Greek mythology",
 * "Roman history", "The French Revolution") — always the narrowest true statement that
 * distinguishes this individual from any other figure who might share a name, era, or
 * role, never a vague genre label.
 */
const gameCharacterWork: Record<string, string> = {
  // Greek & Roman mythology
  Zeus: "Greek mythology",
  Hera: "Greek mythology",
  Poseidon: "Greek mythology",
  Athena: "Greek mythology",
  Apollo: "Greek mythology",
  Artemis: "Greek mythology",
  Ares: "Greek mythology",
  Aphrodite: "Greek mythology",
  Hephaestus: "Greek mythology",
  Hermes: "Greek mythology",
  Dionysus: "Greek mythology",
  Hades: "Greek mythology",
  Persephone: "Greek mythology",
  Demeter: "Greek mythology",
  Cronus: "Greek mythology",
  Prometheus: "Greek mythology",
  Atlas: "Greek mythology",
  Achilles: "Greek mythology (the Trojan War / the Iliad)",
  Odysseus: "Greek mythology (the Odyssey)",
  Hector: "Greek mythology (the Trojan War / the Iliad)",
  Helen: "Greek mythology (Helen of Troy)",
  Perseus: "Greek mythology",
  Medusa: "Greek mythology",
  Pandora: "Greek mythology",
  Icarus: "Greek mythology",
  Daedalus: "Greek mythology",
  Narcissus: "Greek mythology",
  Midas: "Greek mythology",
  Sisyphus: "Greek mythology",
  Oedipus: "Greek mythology (Sophocles' Oedipus Rex)",
  Circe: "Greek mythology (the Odyssey)",
  Cupid: "Roman mythology",
  Venus: "Roman mythology",
  Mars: "Roman mythology",
  Neptune: "Roman mythology",
  Jupiter: "Roman mythology",
  Juno: "Roman mythology",
  Minerva: "Roman mythology",
  Bacchus: "Roman mythology",
  Pluto: "Roman mythology",
  Heracles: "Greek mythology",
  Theseus: "Greek mythology",
  Jason: "Greek mythology (Jason and the Argonauts)",

  // Roman history
  "Julius Caesar": "Roman history",
  "Mark Antony": "Roman history",
  "Cleopatra VII": "Egyptian/Roman history (Ptolemaic Egypt)",
  Nero: "Roman history",
  Hannibal: "Roman/Carthaginian history",
  Spartacus: "Roman history",
  Attila: "History of the Huns",
  Caligula: "Roman history",

  // Egyptian mythology & history
  Ra: "Egyptian mythology",
  Osiris: "Egyptian mythology",
  Isis: "Egyptian mythology",
  Anubis: "Egyptian mythology",
  Tutankhamun: "Egyptian history",
  Nefertiti: "Egyptian history",

  // Norse mythology
  Odin: "Norse mythology",
  Thor: "Norse mythology",
  Loki: "Norse mythology",
  Freya: "Norse mythology",

  // Arthurian legend
  "King Arthur": "Arthurian legend",
  Merlin: "Arthurian legend",
  Guinevere: "Arthurian legend",
  Lancelot: "Arthurian legend",
  "Morgan le Fay": "Arthurian legend",

  // Robin Hood
  "Robin Hood": "The legend of Robin Hood",
  "Maid Marian": "The legend of Robin Hood",
  "Friar Tuck": "The legend of Robin Hood",
  "Little John": "The legend of Robin Hood",
  "Sheriff of Nottingham": "The legend of Robin Hood",

  // Biblical figures
  Moses: "The Hebrew Bible / Old Testament",
  Noah: "The Hebrew Bible / Old Testament",
  Adam: "The Hebrew Bible / Old Testament (Genesis)",
  Eve: "The Hebrew Bible / Old Testament (Genesis)",
  David: "The Hebrew Bible / Old Testament",
  Goliath: "The Hebrew Bible / Old Testament",
  Solomon: "The Hebrew Bible / Old Testament",
  Samson: "The Hebrew Bible / Old Testament",
  Delilah: "The Hebrew Bible / Old Testament",
  Jonah: "The Hebrew Bible / Old Testament",
  Cain: "The Hebrew Bible / Old Testament (Genesis)",
  Abel: "The Hebrew Bible / Old Testament (Genesis)",

  // World history's household names
  "Alexander the Great": "Ancient Macedonian/Greek history",
  Aristotle: "Ancient Greek philosophy",
  Plato: "Ancient Greek philosophy",
  Socrates: "Ancient Greek philosophy",
  Archimedes: "Ancient Greek mathematics/history (Syracuse)",
  "Joan of Arc": "French history (the Hundred Years' War)",
  "William the Conqueror": "English/Norman history",
  "Richard the Lionheart": "English history (the Third Crusade)",
  Saladin: "History of the Crusades",
  "Henry VIII": "English Tudor history",
  "Anne Boleyn": "English Tudor history",
  "Elizabeth I": "English Tudor history",
  "Mary Queen of Scots": "Scottish/English history",
  "Leonardo da Vinci": "Italian Renaissance history",
  Michelangelo: "Italian Renaissance history",
  "Galileo Galilei": "History of science (Italian Renaissance)",
  Columbus: "The Age of Exploration",
  "Napoleon Bonaparte": "French history (the Napoleonic era)",
  "Marie Antoinette": "French history (the French Revolution)",
  "Louis XVI": "French history (the French Revolution)",
  Pocahontas: "Early American colonial history",
  "Harriet Tubman": "American history (the Underground Railroad)",

  // Shakespeare
  Hamlet: "Shakespeare's Hamlet",
  Ophelia: "Shakespeare's Hamlet",
  Macbeth: "Shakespeare's Macbeth",
  "Lady Macbeth": "Shakespeare's Macbeth",
  Othello: "Shakespeare's Othello",
  Iago: "Shakespeare's Othello",
  Romeo: "Shakespeare's Romeo and Juliet",
  Juliet: "Shakespeare's Romeo and Juliet",
  "King Lear": "Shakespeare's King Lear",
  Cordelia: "Shakespeare's King Lear",
  Shylock: "Shakespeare's The Merchant of Venice",
  Puck: "Shakespeare's A Midsummer Night's Dream",
  Titania: "Shakespeare's A Midsummer Night's Dream",
  Oberon: "Shakespeare's A Midsummer Night's Dream",
  Falstaff: "Shakespeare's Henry IV/The Merry Wives of Windsor",

  // Gothic literature
  Dracula: "Bram Stoker's Dracula",
  Frankenstein: "Mary Shelley's Frankenstein (Victor Frankenstein, the scientist)",
  "Dr. Jekyll": "Robert Louis Stevenson's Strange Case of Dr Jekyll and Mr Hyde",
  "Mr. Hyde": "Robert Louis Stevenson's Strange Case of Dr Jekyll and Mr Hyde",
  "Dorian Gray": "Oscar Wilde's The Picture of Dorian Gray",

  // Dickens
  "Oliver Twist": "Charles Dickens' Oliver Twist",
  "Ebenezer Scrooge": "Charles Dickens' A Christmas Carol",
  "Tiny Tim": "Charles Dickens' A Christmas Carol",
  "David Copperfield (Charles Dickens novel)": "Charles Dickens' David Copperfield",
  Pip: "Charles Dickens' Great Expectations",
  "Miss Havisham": "Charles Dickens' Great Expectations",

  // Austen
  "Elizabeth Bennet": "Jane Austen's Pride and Prejudice",
  "Mr. Darcy": "Jane Austen's Pride and Prejudice",
  "Emma Woodhouse": "Jane Austen's Emma",

  // Sherlock Holmes
  "Sherlock Holmes": "Arthur Conan Doyle's Sherlock Holmes stories",
  "Dr. Watson": "Arthur Conan Doyle's Sherlock Holmes stories",
  "Professor Moriarty": "Arthur Conan Doyle's Sherlock Holmes stories",

  // Victorian adventure
  "Long John Silver": "Robert Louis Stevenson's Treasure Island",
  "Jim Hawkins": "Robert Louis Stevenson's Treasure Island",
  "Robinson Crusoe": "Daniel Defoe's Robinson Crusoe",
  Gulliver: "Jonathan Swift's Gulliver's Travels",

  // American literature
  "Huckleberry Finn": "Mark Twain's Adventures of Huckleberry Finn",
  "Tom Sawyer": "Mark Twain's The Adventures of Tom Sawyer",
  "Captain Ahab": "Herman Melville's Moby-Dick",
  "Jay Gatsby": "F. Scott Fitzgerald's The Great Gatsby",

  // American folklore
  "Paul Bunyan": "American folklore",
  "Johnny Appleseed": "American folklore",
  "Davy Crockett": "American history/folklore",
  "Annie Oakley": "American history (Wild West sharpshooter)",
  "Buffalo Bill": "American history (Wild West showman)",
  "Calamity Jane": "American history/folklore (the Wild West)",

  // Russian literature
  "Anna Karenina": "Leo Tolstoy's Anna Karenina",
  Raskolnikov: "Fyodor Dostoevsky's Crime and Punishment",

  // Fairy tales
  Cinderella: "The fairy tale Cinderella",
  "Snow White": "The fairy tale Snow White",
  "Sleeping Beauty": "The fairy tale Sleeping Beauty",
  Rapunzel: "The fairy tale Rapunzel",
  "Little Red Riding Hood": "The fairy tale Little Red Riding Hood",
  Goldilocks: "The fairy tale Goldilocks and the Three Bears",
  Hansel: "The fairy tale Hansel and Gretel",
  Gretel: "The fairy tale Hansel and Gretel",
  Rumpelstiltskin: "The fairy tale Rumpelstiltskin",
  "Puss in Boots": "The fairy tale Puss in Boots",
  "Beauty (Beauty and the Beast)": "The fairy tale Beauty and the Beast",
  "The Beast": "The fairy tale Beauty and the Beast",
  Bluebeard: "The fairy tale Bluebeard",
  "The Little Mermaid": "Hans Christian Andersen's The Little Mermaid",
  "The Ugly Duckling": "Hans Christian Andersen's The Ugly Duckling",
  Thumbelina: "Hans Christian Andersen's Thumbelina",

  // Alice in Wonderland
  Alice: "Lewis Carroll's Alice's Adventures in Wonderland",
  "Mad Hatter": "Lewis Carroll's Alice's Adventures in Wonderland",
  "Cheshire Cat": "Lewis Carroll's Alice's Adventures in Wonderland",
  "Queen of Hearts": "Lewis Carroll's Alice's Adventures in Wonderland",
  "White Rabbit": "Lewis Carroll's Alice's Adventures in Wonderland",

  // The Wizard of Oz
  "Dorothy Gale": "L. Frank Baum's The Wonderful Wizard of Oz",
  "Scarecrow (The Wizard of Oz)": "L. Frank Baum's The Wonderful Wizard of Oz",
  "Tin Man (The Wizard of Oz)": "L. Frank Baum's The Wonderful Wizard of Oz",
  "Cowardly Lion (The Wizard of Oz)": "L. Frank Baum's The Wonderful Wizard of Oz",
  "Wicked Witch of the West": "L. Frank Baum's The Wonderful Wizard of Oz",

  // Peter Pan
  "Peter Pan": "J.M. Barrie's Peter Pan",
  "Wendy Darling": "J.M. Barrie's Peter Pan",
  Tinkerbell: "J.M. Barrie's Peter Pan",
  "Captain Hook": "J.M. Barrie's Peter Pan",

  // Pinocchio
  Pinocchio: "Carlo Collodi's The Adventures of Pinocchio",
  Geppetto: "Carlo Collodi's The Adventures of Pinocchio",
  "Jiminy Cricket": "Carlo Collodi's The Adventures of Pinocchio",

  // The Jungle Book
  Mowgli: "Rudyard Kipling's The Jungle Book",
  Baloo: "Rudyard Kipling's The Jungle Book",
  Bagheera: "Rudyard Kipling's The Jungle Book",
  "Shere Khan": "Rudyard Kipling's The Jungle Book",

  // Winnie-the-Pooh
  "Winnie-the-Pooh": "A.A. Milne's Winnie-the-Pooh",
  Piglet: "A.A. Milne's Winnie-the-Pooh",
  Eeyore: "A.A. Milne's Winnie-the-Pooh",
  Tigger: "A.A. Milne's Winnie-the-Pooh",

  // Arabian Nights
  Aladdin: "One Thousand and One Nights (Arabian Nights)",
  "Ali Baba": "One Thousand and One Nights (Arabian Nights)",
  "Sinbad the Sailor": "One Thousand and One Nights (Arabian Nights)",
  Scheherazade: "One Thousand and One Nights (Arabian Nights)",

  // Chinese mythology & history
  "Sun Wukong": "Chinese mythology (Journey to the West)",
  Confucius: "Chinese history/philosophy",
  "Hua Mulan": "Chinese legend (the Ballad of Mulan)",
  "Sun Tzu": "Chinese history (author of The Art of War)",

  // The Three Musketeers
  "d'Artagnan": "Alexandre Dumas' The Three Musketeers",
  Athos: "Alexandre Dumas' The Three Musketeers",
  Porthos: "Alexandre Dumas' The Three Musketeers",
  Aramis: "Alexandre Dumas' The Three Musketeers",
  "Cardinal Richelieu": "Alexandre Dumas' The Three Musketeers (fictionalized historical figure)",
  "Milady de Winter": "Alexandre Dumas' The Three Musketeers",

  // The Count of Monte Cristo
  "Edmond Dantès": "Alexandre Dumas' The Count of Monte Cristo",

  // The Hunchback of Notre-Dame
  Quasimodo: "Victor Hugo's The Hunchback of Notre-Dame",
  Esmeralda: "Victor Hugo's The Hunchback of Notre-Dame",

  // Les Misérables
  "Jean Valjean": "Victor Hugo's Les Misérables",
  Javert: "Victor Hugo's Les Misérables",
  Cosette: "Victor Hugo's Les Misérables",
  Fantine: "Victor Hugo's Les Misérables",

  // The Phantom of the Opera
  "The Phantom of the Opera": "Gaston Leroux's The Phantom of the Opera",
  "Christine Daaé": "Gaston Leroux's The Phantom of the Opera",

  // Don Quixote
  "Don Quixote": "Miguel de Cervantes' Don Quixote",
  "Sancho Panza": "Miguel de Cervantes' Don Quixote",

  // Faust
  Faust: "Goethe's Faust",
  Mephistopheles: "Goethe's Faust",

  // Greek & Roman mythology (extended)
  Agamemnon: "Greek mythology (the Trojan War / the Iliad)",
  Menelaus: "Greek mythology (the Trojan War / the Iliad)",
  Paris: "Greek mythology (the Trojan War / the Iliad)",
  Priam: "Greek mythology (the Trojan War / the Iliad)",
  Cassandra: "Greek mythology (the Trojan War)",
  Orpheus: "Greek mythology",
  Calypso: "Greek mythology (the Odyssey)",
  Penelope: "Greek mythology (the Odyssey)",
  Ariadne: "Greek mythology",
  Antigone: "Greek mythology (Sophocles' Antigone)",
  Electra: "Greek mythology (Electra, daughter of Agamemnon)",
  Clytemnestra: "Greek mythology (the House of Atreus)",
  Pygmalion: "Greek mythology",
  Galatea: "Greek mythology (the Pygmalion myth)",
  Polyphemus: "Greek mythology (the Odyssey)",
  Pegasus: "Greek mythology",
  Andromeda: "Greek mythology (the Perseus myth)",
  Eurydice: "Greek mythology (the Orpheus myth)",
  Arachne: "Greek mythology",
  Niobe: "Greek mythology",
  Bellerophon: "Greek mythology",
  Atalanta: "Greek mythology",
  Medea: "Greek mythology (Jason and the Argonauts)",
  Jocasta: "Greek mythology (Sophocles' Oedipus Rex)",
  Creon: "Greek mythology (Sophocles' Theban plays)",
  Tantalus: "Greek mythology",
  Ixion: "Greek mythology",
  Epimetheus: "Greek mythology",

  // Roman history (extended)
  Romulus: "Roman mythology/history (founding of Rome)",
  Remus: "Roman mythology/history (founding of Rome)",
  Cicero: "Roman history",
  Pompey: "Roman history",
  Crassus: "Roman history",
  "Scipio Africanus": "Roman history",
  Vercingetorix: "Roman/Gallic history",
  Boudicca: "Roman/British history",
  Hadrian: "Roman history",
  "Marcus Aurelius": "Roman history",
  Constantine: "Roman history",
  Brutus: "Roman history (Marcus Junius Brutus, Julius Caesar's assassin)",
  Cassius: "Roman history (Gaius Cassius Longinus, Julius Caesar's assassin)",

  // Norse mythology (extended)
  Baldr: "Norse mythology",
  Freyr: "Norse mythology",
  Sif: "Norse mythology",
  Fenrir: "Norse mythology",
  Jormungandr: "Norse mythology",
  Sleipnir: "Norse mythology",
  Sigurd: "Norse mythology (the Völsunga saga)",
  Brunhild: "Norse mythology (the Völsunga saga)",
  Heimdall: "Norse mythology",
  Tyr: "Norse mythology",
  Frigg: "Norse mythology",
  Idunn: "Norse mythology",
  Njord: "Norse mythology",

  // Arthurian legend (extended)
  Gawain: "Arthurian legend",
  Percival: "Arthurian legend",
  Galahad: "Arthurian legend",
  Tristan: "Arthurian/medieval legend (Tristan and Isolde)",
  Isolde: "Arthurian/medieval legend (Tristan and Isolde)",
  Mordred: "Arthurian legend",
  "Uther Pendragon": "Arthurian legend",
  Bedivere: "Arthurian legend",
  Nimue: "Arthurian legend",
  Igraine: "Arthurian legend",

  // Egyptian mythology & history (extended)
  Horus: "Egyptian mythology",
  Set: "Egyptian mythology",
  Thoth: "Egyptian mythology",
  Hathor: "Egyptian mythology",
  "Ramesses II": "Egyptian history",
  Akhenaten: "Egyptian history",
  Hatshepsut: "Egyptian history",
  Nefertari: "Egyptian history",
  Bastet: "Egyptian mythology",
  Sekhmet: "Egyptian mythology",
  Nut: "Egyptian mythology",
  Geb: "Egyptian mythology",
  Ptah: "Egyptian mythology",
  Sobek: "Egyptian mythology",
  Amun: "Egyptian mythology",
  Nefertem: "Egyptian mythology",

  // Robin Hood (extended)
  "Will Scarlet": "The legend of Robin Hood",
  "Prince John": "The legend of Robin Hood (fictionalized historical figure)",
  "Guy of Gisbourne": "The legend of Robin Hood",

  // Biblical figures (extended)
  Ruth: "The Hebrew Bible / Old Testament (Book of Ruth)",
  Esther: "The Hebrew Bible / Old Testament (Book of Esther)",
  Job: "The Hebrew Bible / Old Testament (Book of Job)",
  Daniel: "The Hebrew Bible / Old Testament (Book of Daniel)",
  "Mary Magdalene": "The New Testament",
  "Pontius Pilate": "The New Testament",
  "John the Baptist": "The New Testament",
  Herod: "The New Testament (Herod the Great)",
  Salome: "The New Testament / Jewish history",
  Abraham: "The Hebrew Bible / Old Testament (Genesis)",
  Isaac: "The Hebrew Bible / Old Testament (Genesis)",
  Jacob: "The Hebrew Bible / Old Testament (Genesis)",
  Joseph: "The Hebrew Bible / Old Testament (Genesis)",
  Elijah: "The Hebrew Bible / Old Testament",
  Elisha: "The Hebrew Bible / Old Testament",
  Deborah: "The Hebrew Bible / Old Testament (Book of Judges)",
  Gideon: "The Hebrew Bible / Old Testament (Book of Judges)",

  // Shakespeare (extended)
  Coriolanus: "Shakespeare's Coriolanus",
  Antony: "Shakespeare's Antony and Cleopatra",
  "Titus Andronicus": "Shakespeare's Titus Andronicus",
  Prospero: "Shakespeare's The Tempest",
  Miranda: "Shakespeare's The Tempest",
  Ariel: "Shakespeare's The Tempest",
  Caliban: "Shakespeare's The Tempest",
  Beatrice: "Shakespeare's Much Ado About Nothing",
  Benedick: "Shakespeare's Much Ado About Nothing",
  Portia: "Shakespeare's The Merchant of Venice",
  Malvolio: "Shakespeare's Twelfth Night",
  "Rosalind (As You Like It)": "Shakespeare's As You Like It",

  // Gothic literature (extended)
  "Van Helsing": "Bram Stoker's Dracula",
  "Jonathan Harker": "Bram Stoker's Dracula",
  "Mina Murray": "Bram Stoker's Dracula",
  "Lucy Westenra": "Bram Stoker's Dracula",
  Renfield: "Bram Stoker's Dracula",

  // Dickens (extended)
  Fagin: "Charles Dickens' Oliver Twist",
  "Uriah Heep": "Charles Dickens' David Copperfield",
  "Sydney Carton": "Charles Dickens' A Tale of Two Cities",
  "Madame Defarge": "Charles Dickens' A Tale of Two Cities",
  Magwitch: "Charles Dickens' Great Expectations",
  "Charles Darnay": "Charles Dickens' A Tale of Two Cities",
  "Lucie Manette": "Charles Dickens' A Tale of Two Cities",
  Estella: "Charles Dickens' Great Expectations",

  // Thackeray
  "Becky Sharp": "William Makepeace Thackeray's Vanity Fair",

  // Brontë (extended)
  Heathcliff: "Emily Brontë's Wuthering Heights",
  "Catherine Earnshaw": "Emily Brontë's Wuthering Heights",
  "Jane Eyre": "Charlotte Brontë's Jane Eyre",
  "Mr. Rochester": "Charlotte Brontë's Jane Eyre",

  // The Three Musketeers (extended)
  "Constance Bonacieux": "Alexandre Dumas' The Three Musketeers",
  "Anne of Austria": "Alexandre Dumas' The Three Musketeers (fictionalized historical figure)",

  // American literature (extended)
  "Ichabod Crane": "Washington Irving's The Legend of Sleepy Hollow",
  "Rip Van Winkle": "Washington Irving's Rip Van Winkle",

  // Fairy tales (extended)
  "Snow Queen": "Hans Christian Andersen's The Snow Queen",
  "The Emperor (The Emperor's New Clothes)": "Hans Christian Andersen's The Emperor's New Clothes",

  // African history
  "Sundiata Keita": "History of the Mali Empire",
  "Mansa Musa": "History of the Mali Empire",
  "Shaka Zulu": "History of the Zulu Kingdom",

  // Native American history
  Squanto: "Early American colonial history",
  Tecumseh: "American history (Shawnee leader)",
  Geronimo: "American history (Apache leader)",
  "Sitting Bull": "American history (Lakota Sioux leader)",

  // Ancient philosophers & scholars
  Diogenes: "Ancient Greek philosophy (the Cynics)",
  Epicurus: "Ancient Greek philosophy",
  Seneca: "Ancient Roman philosophy/history",
  Hypatia: "Ancient history (philosopher and mathematician of Alexandria)",
  Avicenna: "History of medieval Islamic philosophy/medicine",
  "Omar Khayyam": "History of medieval Persian poetry/mathematics",
  Rumi: "History of medieval Persian/Sufi poetry",

  // Renaissance, Reformation & Age of Exploration
  "Catherine of Aragon": "English Tudor history",
  "Jane Seymour": "English Tudor history",
  "Cardinal Wolsey": "English Tudor history",
  "Thomas Cromwell": "English Tudor history",
  "Thomas More": "English Tudor history",
  "Philip II of Spain": "Spanish history",
  Savonarola: "Italian Renaissance history",
  Cortés: "The Age of Exploration (Spanish conquest of the Aztec Empire)",
  Pizarro: "The Age of Exploration (Spanish conquest of the Inca Empire)",
  "Ibn Battuta": "History of medieval Islamic exploration",
  Charlemagne: "History of the Carolingian Empire",
  Beowulf: "The Old English epic poem Beowulf",
  Grendel: "The Old English epic poem Beowulf",
  "Francis Drake": "English history (the Age of Exploration)",
  "Walter Raleigh": "English history (the Age of Exploration)",
  Copernicus: "History of science (Renaissance astronomy)",
  Raphael: "Italian Renaissance history",
  Machiavelli: "Italian Renaissance history",
  "Vasco da Gama": "The Age of Exploration",
  Magellan: "The Age of Exploration",
  "Marco Polo": "Medieval history (travel to Asia)",
  "Vlad the Impaler": "History of Wallachia (the historical inspiration for Dracula)",
  "Suleiman the Magnificent": "Ottoman history",
  Roxelana: "Ottoman history",
  "Mehmed II": "Ottoman history (the fall of Constantinople)",
  "Constantine XI": "Byzantine history (the fall of Constantinople)",
  "Ivan the Terrible": "Russian history",
  "Boris Godunov": "Russian history",
  "Oliver Cromwell": "English history (the English Civil War)",
  "Louis XIV": "French history",
  "Peter the Great": "Russian history",
  "Catherine the Great": "Russian history",
  "Frederick the Great": "Prussian history",
  "Maria Theresa": "Austrian/Habsburg history",
  "Stephen the Great": "History of Moldavia",

  // French Revolution & Napoleonic era
  "Josephine de Beauharnais": "French history (the Napoleonic era)",
  Wellington: "British history (the Napoleonic era)",
  Robespierre: "French history (the French Revolution)",
  Danton: "French history (the French Revolution)",
  Marat: "French history (the French Revolution)",

  // Romantic poets
  "Lord Byron": "English Romantic poetry",
  "Percy Bysshe Shelley": "English Romantic poetry",
  "Mary Shelley": "English Romantic-era literature (author of Frankenstein)",
};

export default gameCharacterWork;
