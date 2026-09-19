/**
 * Curated subset of `characterNames` for the guessing game only — figures picked
 * specifically for broad, mainstream name recognition (Greek gods, Shakespeare leads,
 * fairy tales, Sherlock Holmes, world history's household names), not just "public
 * domain." The full ~1000-entry list in `characterNames.ts` is deliberately broad
 * (obscure Titans, minor saga figures, one-off Victorian side characters) so it works
 * well for `/random-character`'s "surprise me, then go build a bot around it" flow,
 * where the name is shown up front and its obscurity is part of the fun. The game is a
 * different use case: a hidden name the player has to *infer from clues*, so an obscure
 * figure makes the round unwinnable no matter how good the clues are. See GitHub issue
 * #878 ("game is too hard") — this list, together with the more concrete clue-pacing
 * rules in `generateGameCluePersonaPrompt` (src/config/serverConfig.ts), is the fix: aim
 * for players walking away with long streaks of correct guesses, not stuck on their
 * first one.
 *
 * Every entry here is copied verbatim from `characterNames.ts` (same spelling/
 * disambiguation suffix), not a separate, independent list — `tests/src/data/
 * gameCharacterNames.test.ts` pins that every entry still exists there, so the two
 * files can't silently drift apart.
 */
const gameCharacterNames: string[] = [
  // Greek & Roman mythology
  "Zeus",
  "Hera",
  "Poseidon",
  "Athena",
  "Apollo",
  "Artemis",
  "Ares",
  "Aphrodite",
  "Hephaestus",
  "Hermes",
  "Dionysus",
  "Hades",
  "Persephone",
  "Demeter",
  "Cronus",
  "Prometheus",
  "Atlas",
  "Achilles",
  "Odysseus",
  "Hector",
  "Helen",
  "Perseus",
  "Heracles",
  "Theseus",
  "Jason",
  "Medusa",
  "Pandora",
  "Icarus",
  "Daedalus",
  "Narcissus",
  "Midas",
  "Sisyphus",
  "Oedipus",
  "Circe",
  "Cupid",
  "Venus",
  "Mars",
  "Neptune",
  "Jupiter",
  "Juno",
  "Minerva",
  "Bacchus",
  "Pluto",

  // Roman history
  "Julius Caesar",
  "Mark Antony",
  "Cleopatra VII",
  "Nero",
  "Hannibal",
  "Spartacus",
  "Attila",
  "Caligula",

  // Egyptian mythology & history
  "Ra",
  "Osiris",
  "Isis",
  "Anubis",
  "Tutankhamun",
  "Nefertiti",

  // Norse mythology
  "Odin",
  "Thor",
  "Loki",
  "Freya",

  // Arthurian legend
  "King Arthur",
  "Merlin",
  "Guinevere",
  "Lancelot",
  "Morgan le Fay",

  // Robin Hood
  "Robin Hood",
  "Maid Marian",
  "Friar Tuck",
  "Little John",
  "Sheriff of Nottingham",

  // Biblical figures
  "Moses",
  "Noah",
  "Adam",
  "Eve",
  "David",
  "Goliath",
  "Solomon",
  "Samson",
  "Delilah",
  "Jonah",
  "Cain",
  "Abel",

  // World history's household names
  "Alexander the Great",
  "Aristotle",
  "Plato",
  "Socrates",
  "Archimedes",
  "Joan of Arc",
  "William the Conqueror",
  "Richard the Lionheart",
  "Saladin",
  "Henry VIII",
  "Anne Boleyn",
  "Elizabeth I",
  "Mary Queen of Scots",
  "Leonardo da Vinci",
  "Michelangelo",
  "Galileo Galilei",
  "Columbus",
  "Napoleon Bonaparte",
  "Marie Antoinette",
  "Louis XVI",
  "Pocahontas",
  "Harriet Tubman",

  // Shakespeare
  "Hamlet",
  "Ophelia",
  "Macbeth",
  "Lady Macbeth",
  "Othello",
  "Iago",
  "Romeo",
  "Juliet",
  "King Lear",
  "Cordelia",
  "Shylock",
  "Puck",
  "Titania",
  "Oberon",
  "Falstaff",

  // Gothic literature
  "Dracula",
  "Frankenstein",
  "Dr. Jekyll",
  "Mr. Hyde",
  "Dorian Gray",

  // Dickens
  "Oliver Twist",
  "Ebenezer Scrooge",
  "Tiny Tim",
  "David Copperfield",
  "Pip",
  "Miss Havisham",

  // Austen
  "Elizabeth Bennet",
  "Mr. Darcy",
  "Emma Woodhouse",

  // Sherlock Holmes
  "Sherlock Holmes",
  "Dr. Watson",
  "Professor Moriarty",

  // Victorian adventure
  "Long John Silver",
  "Jim Hawkins",
  "Robinson Crusoe",
  "Gulliver",

  // American literature
  "Huckleberry Finn",
  "Tom Sawyer",
  "Captain Ahab",
  "Jay Gatsby",

  // American folklore
  "Paul Bunyan",
  "Johnny Appleseed",
  "Davy Crockett",
  "Annie Oakley",
  "Buffalo Bill",
  "Calamity Jane",

  // Russian literature
  "Anna Karenina",
  "Raskolnikov",

  // Fairy tales
  "Cinderella",
  "Snow White",
  "Sleeping Beauty",
  "Rapunzel",
  "Little Red Riding Hood",
  "Goldilocks",
  "Hansel",
  "Gretel",
  "Rumpelstiltskin",
  "Puss in Boots",
  "Beauty",
  "The Beast",
  "Bluebeard",
  "The Little Mermaid",
  "The Ugly Duckling",
  "Thumbelina",

  // Alice in Wonderland
  "Alice",
  "Mad Hatter",
  "Cheshire Cat",
  "Queen of Hearts",
  "White Rabbit",

  // The Wizard of Oz
  "Dorothy Gale",
  "Scarecrow",
  "Tin Man",
  "Cowardly Lion",
  "Wicked Witch of the West",

  // Peter Pan
  "Peter Pan",
  "Wendy Darling",
  "Tinkerbell",
  "Captain Hook",

  // Pinocchio
  "Pinocchio",
  "Geppetto",
  "Jiminy Cricket",

  // The Jungle Book
  "Mowgli",
  "Baloo",
  "Bagheera",
  "Shere Khan",

  // Winnie-the-Pooh
  "Winnie-the-Pooh",
  "Piglet",
  "Eeyore",
  "Tigger",

  // Arabian Nights
  "Aladdin",
  "Ali Baba",
  "Sinbad the Sailor",
  "Scheherazade",

  // Chinese mythology & history
  "Sun Wukong",
  "Confucius",
  "Hua Mulan",
  "Sun Tzu",

  // The Three Musketeers
  "d'Artagnan",
  "Athos",
  "Porthos",
  "Aramis",
  "Cardinal Richelieu",
  "Milady de Winter",

  // The Count of Monte Cristo
  "Edmond Dantès",

  // The Hunchback of Notre-Dame
  "Quasimodo",
  "Esmeralda",

  // Les Misérables
  "Jean Valjean",
  "Javert",
  "Cosette",
  "Fantine",

  // The Phantom of the Opera
  "The Phantom of the Opera",
  "Christine Daaé",

  // Don Quixote
  "Don Quixote",
  "Sancho Panza",

  // Faust
  "Faust",
  "Mephistopheles",

  // Greek & Roman mythology (extended)
  "Agamemnon",
  "Menelaus",
  "Paris",
  "Priam",
  "Cassandra",
  "Orpheus",
  "Calypso",
  "Penelope",
  "Ariadne",
  "Antigone",
  "Electra",
  "Clytemnestra",
  "Pygmalion",
  "Galatea",
  "Polyphemus",
  "Pegasus",
  "Andromeda",
  "Eurydice",
  "Arachne",
  "Niobe",
  "Bellerophon",
  "Atalanta",
  "Medea",
  "Jocasta",
  "Creon",
  "Tantalus",
  "Ixion",
  "Epimetheus",

  // Roman history (extended)
  "Romulus",
  "Remus",
  "Cicero",
  "Pompey",
  "Crassus",
  "Scipio Africanus",
  "Vercingetorix",
  "Boudicca",
  "Hadrian",
  "Marcus Aurelius",
  "Constantine",
  "Brutus",
  "Cassius",

  // Norse mythology (extended)
  "Baldr",
  "Freyr",
  "Sif",
  "Fenrir",
  "Jormungandr",
  "Sleipnir",
  "Sigurd",
  "Brunhild",
  "Heimdall",
  "Tyr",
  "Frigg",
  "Idunn",
  "Njord",

  // Arthurian legend (extended)
  "Gawain",
  "Percival",
  "Galahad",
  "Tristan",
  "Isolde",
  "Mordred",
  "Uther Pendragon",
  "Bedivere",
  "Nimue",
  "Igraine",

  // Egyptian mythology & history (extended)
  "Horus",
  "Set",
  "Thoth",
  "Hathor",
  "Ramesses II",
  "Akhenaten",
  "Hatshepsut",
  "Nefertari",
  "Bastet",
  "Sekhmet",
  "Nut",
  "Geb",
  "Ptah",
  "Sobek",
  "Amun",
  "Nefertem",

  // Robin Hood (extended)
  "Will Scarlet",
  "Prince John",
  "Guy of Gisbourne",

  // Biblical figures (extended)
  "Ruth",
  "Esther",
  "Job",
  "Daniel",
  "Mary Magdalene",
  "Pontius Pilate",
  "John the Baptist",
  "Herod",
  "Salome",
  "Abraham",
  "Isaac",
  "Jacob",
  "Joseph",
  "Elijah",
  "Elisha",
  "Deborah",
  "Gideon",

  // Shakespeare (extended)
  "Coriolanus",
  "Antony",
  "Titus Andronicus",
  "Prospero",
  "Miranda",
  "Ariel",
  "Caliban",
  "Beatrice",
  "Benedick",
  "Portia",
  "Malvolio",
  "Rosalind",

  // Gothic literature (extended)
  "Van Helsing",
  "Jonathan Harker",
  "Mina Murray",
  "Lucy Westenra",
  "Renfield",

  // Dickens (extended)
  "Fagin",
  "Uriah Heep",
  "Sydney Carton",
  "Madame Defarge",
  "Magwitch",
  "Charles Darnay",
  "Lucie Manette",
  "Estella",

  // Thackeray
  "Becky Sharp",

  // Brontë (extended)
  "Heathcliff",
  "Catherine Earnshaw",
  "Jane Eyre",
  "Mr. Rochester",

  // The Three Musketeers (extended)
  "Constance Bonacieux",
  "Anne of Austria",

  // American literature (extended)
  "Ichabod Crane",
  "Rip Van Winkle",

  // Fairy tales (extended)
  "Snow Queen",
  "The Emperor",

  // African history
  "Sundiata Keita",
  "Mansa Musa",
  "Shaka Zulu",

  // Native American history
  "Squanto",
  "Tecumseh",
  "Geronimo",
  "Sitting Bull",

  // Ancient philosophers & scholars
  "Diogenes",
  "Epicurus",
  "Seneca",
  "Hypatia",
  "Avicenna",
  "Omar Khayyam",
  "Rumi",

  // Renaissance, Reformation & Age of Exploration
  "Catherine of Aragon",
  "Jane Seymour",
  "Cardinal Wolsey",
  "Thomas Cromwell",
  "Thomas More",
  "Philip II of Spain",
  "Savonarola",
  "Cortés",
  "Pizarro",
  "Ibn Battuta",
  "Charlemagne",
  "Beowulf",
  "Grendel",
  "Francis Drake",
  "Walter Raleigh",
  "Copernicus",
  "Raphael",
  "Machiavelli",
  "Vasco da Gama",
  "Magellan",
  "Marco Polo",
  "Vlad the Impaler",
  "Suleiman the Magnificent",
  "Roxelana",
  "Mehmed II",
  "Constantine XI",
  "Ivan the Terrible",
  "Boris Godunov",
  "Oliver Cromwell",
  "Louis XIV",
  "Peter the Great",
  "Catherine the Great",
  "Frederick the Great",
  "Maria Theresa",
  "Stephen the Great",

  // French Revolution & Napoleonic era
  "Josephine de Beauharnais",
  "Wellington",
  "Robespierre",
  "Danton",
  "Marat",

  // Romantic poets
  "Lord Byron",
  "Percy Bysshe Shelley",
  "Mary Shelley",
];

export default gameCharacterNames;
