// 1000+ public domain characters: mythology, folklore, literature (pre-1928), and history.
const characterNames: string[] = [
  // Greek Mythology — Olympians & major gods
  "Zeus", "Hera", "Poseidon", "Demeter", "Athena", "Apollo", "Artemis",
  "Ares", "Aphrodite", "Hephaestus", "Hermes", "Dionysus", "Hades", "Persephone",
  "Eros", "Eris", "Nike", "Tyche", "Nemesis", "Hecate", "Morpheus",
  "Hypnos", "Thanatos", "Iris", "Helios", "Selene", "Eos", "Boreas",
  "Zephyrus", "Notus", "Eurus", "Aether", "Nyx", "Erebus",
  "Prometheus", "Epimetheus", "Atlas", "Cronus", "Rhea", "Uranus", "Gaia",
  "Oceanus", "Tethys", "Themis", "Mnemosyne", "Hyperion", "Theia",
  "Coeus", "Phoebe", "Crius", "Iapetus",

  // Greek Mythology — Heroes
  "Achilles", "Odysseus", "Agamemnon", "Menelaus", "Ajax the Greater", "Ajax the Lesser", "Diomedes", "Patroclus",
  "Hector", "Paris", "Priam", "Andromache", "Cassandra", "Hecuba", "Helen",
  "Perseus", "Heracles", "Theseus", "Jason", "Orpheus", "Bellerophon",
  "Meleager", "Atalanta", "Medea", "Circe", "Calypso", "Penelope", "Ariadne",
  "Phaedra", "Antigone", "Electra", "Clytemnestra", "Oedipus", "Creon", "Jocasta",
  "Icarus", "Daedalus", "Narcissus", "Echo", "Daphne", "Syrinx", "Io",
  "Europa", "Leda", "Ganymede", "Semele", "Tiresias", "Midas",
  "Tantalus", "Sisyphus", "Ixion", "Pygmalion", "Galatea", "Pandora",
  "Aeneas", "Anchises", "Creusa", "Ascanius", "Calchas", "Chryseis", "Briseis",
  "Autolycon", "Antilochus", "Idomeneus", "Nestor",
  "Polyphemus", "Circe", "Nausicaa", "Telemachus",
  "Iphigenia", "Orestes", "Pylades", "Aegisthus",
  "Philoctetes", "Oenone", "Deiphobus", "Antenor",
  "Laocoon", "Sinon", "Troilus", "Cressida",
  "Alcestis", "Admetus", "Protesilaus", "Laodamia",
  "Evadne", "Capaneus", "Amphiaraus",
  "Tydeus", "Polynices", "Eteocles",
  "Medusa", "Pegasus", "Chrysaor", "Andromeda", "Cepheus", "Cassiopeia",
  "Hippolyta", "Hippolytus", "Phaedra",
  "Eurydice", "Aristaeus",
  "Atalanta", "Hippomenes",
  "Actaeon", "Callisto",
  "Endymion", "Selene",
  "Psyche", "Eros",
  "Arachne", "Niobe",
  "Melampus", "Bias",
  "Asclepius", "Hygieia", "Panacea",

  // Roman Mythology & Gods
  "Jupiter", "Juno", "Neptune", "Pluto", "Ceres", "Mars", "Venus",
  "Minerva", "Diana", "Mercury", "Vulcan", "Bacchus", "Cupid",
  "Janus", "Saturn", "Vesta", "Faunus", "Fauna", "Silvanus",
  "Terminus", "Quirinus", "Consus", "Fortuna", "Bellona",
  "Romulus", "Remus", "Aeneas", "Turnus", "Lavinia", "Latinus",
  "Camilla", "Mezentius", "Evander", "Pallas", "Lausus",
  "Dido", "Sychaeus", "Iarbas", "Anna",

  // Roman History
  "Julius Caesar", "Brutus", "Cassius", "Mark Antony", "Octavia",
  "Cicero", "Cato the Younger", "Pompey", "Crassus", "Scipio Africanus",
  "Hannibal", "Vercingetorix", "Spartacus", "Crixus",
  "Boudicca", "Caligula", "Nero", "Hadrian", "Marcus Aurelius",
  "Diocletian", "Constantine", "Theodosius", "Attila",
  "Livia", "Agrippina", "Messalina", "Berenice",

  // Norse Mythology
  "Odin", "Thor", "Loki", "Freya", "Frigg", "Tyr", "Baldr",
  "Heimdall", "Vidar", "Vali (Norse mythology)", "Bragi", "Forseti", "Ullr", "Hodr",
  "Mimir", "Njord", "Freyr", "Skadi", "Idunn", "Sif", "Nanna (Norse mythology)",
  "Sigyn", "Angrboda", "Hel", "Fenrir", "Jormungandr", "Sleipnir",
  "Sigurd", "Brunhild", "Gudrun", "Atli", "Gunnar", "Hogni", "Reginn",
  "Fafnir", "Andvari", "Hreidmar", "Volsung", "Signy", "Helgi",
  "Beowulf", "Grendel", "Hrothgar", "Wiglaf", "Unferth", "Wealhtheow",
  "Ragnar Lodbrok", "Bjorn Ironside", "Ivar the Boneless", "Rollo",
  "Gudrid Thorbjarnardóttir", "Leif Erikson",
  "Egil Skallagrimsson", "Njal", "Gunnar of Hlidarendi",
  "Grettir Asmundarson", "Gisli Sursson",
  "Audun", "Hrafnkel",
  "Ragnheidr", "Aud the Deep-Minded",

  // Celtic & Arthurian Mythology
  "King Arthur", "Merlin", "Guinevere", "Lancelot", "Gawain", "Percival",
  "Galahad", "Tristan", "Isolde", "Kay", "Bedivere", "Bors", "Lamorak",
  "Mordred", "Morgan le Fay", "Nimue", "Elaine of Corbenic", "Elaine of Astolat",
  "Gareth", "Gaheris", "Pelleas", "Ettarre", "Sir Dinadan", "Sir Palomides",
  "Pellinore", "Accolon", "Leodegrance", "Igraine", "Uther Pendragon",
  "Vortigern", "Ambrosius Aurelianus",
  "Cú Chulainn", "Finn MacCool", "Oisín", "Niamh", "Diarmuid", "Gráinne",
  "Conchobar mac Nessa", "Deirdre", "Naoise", "Maeve", "Fergus mac Róich",
  "Cormac mac Airt", "Lugh", "The Dagda", "Morrigan", "Brigid",
  "Taliesin", "Bran", "Branwen", "Manawyddan", "Pryderi", "Rhiannon",
  "Math", "Gwydion", "Arianrhod", "Lleu Llaw Gyffes", "Dylan",
  "Pwyll", "Arawn", "Cerridwen", "Amaethon",

  // Egyptian Mythology
  "Ra", "Osiris", "Isis", "Horus", "Set", "Nephthys", "Thoth",
  "Anubis", "Bastet", "Sekhmet", "Hathor", "Nut", "Geb", "Shu",
  "Tefnut", "Ptah", "Sobek", "Khnum", "Amun", "Mut", "Khonsu",
  "Neith", "Selket", "Montu", "Nefertem", "Maat", "Aten", "Atum",
  "Khepri", "Wadjet", "Nekhbet", "Apep", "Serapis",
  "Nefertiti", "Ramesses II", "Tutankhamun", "Akhenaten",
  "Hatshepsut", "Thutmose III", "Amenhotep III", "Imhotep", "Nefertari",
  "Cleopatra VII", "Ptolemy", "Berenice II",

  // Mesopotamian Mythology
  "Gilgamesh", "Enkidu", "Shamhat", "Utnapishtim", "Siduri",
  "Marduk", "Tiamat", "Apsu", "Enlil", "Enki", "Ninhursag", "Inanna",
  "Ishtar", "Dumuzi", "Ereshkigal", "Nergal", "Nanna (Mesopotamian mythology)", "Utu",
  "Ashur", "Adad", "Ninurta", "Nabu", "Nisaba", "Anu",
  "Etana", "Adapa", "Atra-Hasis",
  "Sargon of Akkad", "Naram-Sin",
  "Nebuchadnezzar II", "Belshazzar", "Darius the Mede",

  // Persian / Zoroastrian
  "Ahura Mazda", "Angra Mainyu", "Zarathustra", "Mithra",
  "Rostam", "Sohrab", "Zal", "Rudabeh", "Simorgh",
  "Kaykhusraw", "Afrasiyab", "Garshasp",
  "Cyrus the Great", "Darius the Great", "Xerxes", "Artaxerxes",

  // Hindu Mythology
  "Vishnu", "Shiva", "Brahma", "Lakshmi", "Saraswati", "Parvati",
  "Ganesha", "Karttikeya", "Indra", "Varuna", "Agni", "Surya",
  "Chandra", "Yama", "Kama", "Rama", "Sita", "Hanuman", "Lakshmana",
  "Ravana", "Vibhishana", "Jatayu", "Sugriva", "Vali (Hindu mythology)", "Krishna",
  "Arjuna", "Bhima", "Yudhishthira", "Nakula", "Sahadeva", "Draupadi",
  "Karna", "Duryodhana", "Drona", "Bhishma", "Dhritarashtra", "Kunti",
  "Gandhari", "Vidura", "Abhimanyu", "Subhadra",
  "Balarama", "Rukmini", "Radha", "Narada", "Vasishtha", "Vishvamitra",
  "Prahlada", "Hiranyakashipu", "Bali", "Vamana",
  "Kali", "Durga", "Chamunda", "Mahishasura",
  "Garuda", "Naga", "Vasuki", "Shesha",

  // Buddhist Figures (mythological)
  "Siddhartha Gautama", "Maitreya", "Avalokiteshvara", "Manjushri",
  "Vajrapani", "Tara", "Mahakala", "Yama",
  "Ashoka", "Ananda", "Devadatta",

  // Chinese Mythology & Literature
  "Sun Wukong", "Tang Sanzang", "Zhu Bajie", "Sha Wujing", "White Dragon Horse",
  "Nuwa", "Fuxi", "Pangu", "Shennong", "Huangdi", "Yao", "Shun",
  "Yu the Great", "Nezha", "Erlang Shen", "Guan Yu", "Zhuge Liang",
  "Liu Bei", "Cao Cao", "Sun Quan", "Zhang Fei", "Zhao Yun",
  "Lu Bu", "Diaochan", "Zhang Liao", "Guo Jia",
  "Hua Mulan", "Yang Guifei", "Wu Zetian", "Wang Zhaojun",
  "Lady Wang", "Lady Sun",
  "Confucius", "Laozi", "Mencius", "Sun Tzu", "Zhuangzi", "Xunzi",
  "Li Bai", "Du Fu", "Su Shi",
  "Xu Xian", "White Snake", "Green Snake", "Fa Hai",
  "Liang Shanbo", "Zhu Yingtai",
  "He Xiangu", "Lu Dongbin", "Zhongli Quan",
  "Zhang Guolao", "Cao Guojiu", "Lan Caihe", "Li Tieguai", "Han Xiangzi",
  "Jade Emperor", "Queen Mother of the West", "Chang'e", "Hou Yi",
  "Zao Jun", "Tu Di Gong",

  // Japanese Mythology & History
  "Amaterasu", "Susanoo", "Tsukuyomi", "Izanagi", "Izanami",
  "Okuninushi", "Ninigi", "Jimmu", "Yamato Takeru",
  "Momotaro", "Urashima Taro", "Kaguya-hime", "Issun-boshi",
  "Tanuki", "Kitsune", "Tengu", "Oni",
  "Benkei", "Minamoto no Yoshitsune", "Tomoe Gozen",
  "Oda Nobunaga", "Toyotomi Hideyoshi", "Tokugawa Ieyasu",
  "Date Masamune", "Sanada Yukimura", "Honda Tadakatsu",
  "Yoritomo", "Shizuka Gozen", "Izumo no Okuni",
  "Lady Nijō", "Sei Shonagon", "Murasaki Shikibu",
  "Genji", "Lady Aoi", "Lady Rokujo", "Yugao", "Ukifune",

  // Arabian Nights & Islamic Folklore
  "Scheherazade", "Shahryar", "Sinbad the Sailor", "Ali Baba", "Aladdin",
  "Morgiana", "Harun al-Rashid", "Jafar the Vizier", "The Fisherman",
  "Zumurud", "Marjana", "Gharib", "Ajib",
  "Qamar al-Zaman", "Badoura",
  "Ma'ruf the Cobbler",

  // Slavic Mythology
  "Perun", "Veles", "Mokosh", "Svarog", "Lada", "Marzanna",
  "Baba Yaga", "Koschei the Deathless", "Ivan Tsarevich", "Vasilisa the Beautiful",
  "Firebird", "Grey Wolf",
  "Dobrynya Nikitich", "Ilya Muromets", "Alyosha Popovich",
  "Sadko", "Dunai", "Svyatogor", "Mikula Selyaninovich",
  "Rusalka", "Kikimora", "Domovoi", "Vodyanoy",
  "Snegurochka", "Morozko",
  "Ruslan", "Lyudmila", "Chernomor", "Ratmir",

  // African Mythology
  "Anansi", "Ogun", "Shango", "Yemoja", "Obatala", "Orunmila",
  "Elegba", "Oya", "Osun", "Nzambi", "Nyame", "Mawu", "Lisa",
  "Oya", "Obba", "Yewa",
  "Sundiata Keita", "Mansa Musa", "Shaka Zulu", "Makeda",
  "Chaka", "Moshoeshoe",
  "Anansi", "Br'er Rabbit",
  "Kibuka", "Wanema",

  // Mesoamerican Mythology
  "Quetzalcoatl", "Tlaloc", "Huitzilopochtli", "Coatlicue", "Xipe Totec",
  "Tezcatlipoca", "Chalchiuhtlicue", "Tlahuizcalpantecuhtli",
  "Itzamna", "Ix Chel", "Kukulkan", "Hunab Ku",
  "Hun Hunahpu", "Hunahpu", "Xbalanque", "Vucub Caquix",

  // South American Mythology
  "Viracocha", "Inti", "Mama Quilla", "Supay", "Pachamama",
  "Kon", "Aiapaec",

  // North American Mythology & Folklore
  "Raven (Trickster)", "Coyote (Trickster)", "Thunderbird", "White Buffalo Calf Woman",
  "Nanabozho", "Glooscap", "Sedna",
  "Kokopelli", "Spider Grandmother",

  // Robin Hood Cycle
  "Robin Hood", "Maid Marian", "Friar Tuck", "Little John",
  "Will Scarlet", "Much the Miller's Son", "Alan-a-Dale",
  "Sheriff of Nottingham", "Prince John", "Guy of Gisbourne",

  // Charlemagne & Carolingian
  "Charlemagne", "Roland", "Oliver", "Archbishop Turpin",
  "Ganelon", "Bradamante", "Ruggiero", "Orlando",
  "Angelica", "Rinaldo", "Sacripante", "Astolfo",
  "Marfisa", "Zerbino", "Isabella",

  // El Cid
  "El Cid", "Jimena", "Rodrigo Díaz de Vivar",

  // Biblical Figures (public domain)
  "Moses", "Solomon", "Samson", "Delilah", "Ruth", "Esther", "Judith",
  "Job", "Jonah", "Elijah", "Elisha", "David", "Goliath", "Saul",
  "Daniel", "Nebuchadnezzar", "Belshazzar",
  "Mary Magdalene", "Pontius Pilate",
  "John the Baptist", "Herod", "Salome",
  "Adam", "Eve", "Cain", "Abel", "Noah", "Abraham", "Isaac", "Jacob",
  "Joseph", "Pharaoh", "Rachel", "Leah",
  "Deborah", "Jael", "Gideon", "Jephthah",
  "Isaiah", "Jeremiah", "Ezekiel",
  "Methuselah", "Enoch",

  // Medieval European History
  "Alexander the Great", "Aristotle", "Plato", "Socrates", "Pythagoras",
  "Archimedes", "Hippocrates", "Herodotus", "Thucydides",
  "Pericles", "Themistocles", "Leonidas", "Alcibiades", "Epaminondas",
  "Philip II of Macedon",
  "Joan of Arc", "William the Conqueror", "Harold Godwinson",
  "Henry II of England", "Thomas Becket", "Eleanor of Aquitaine",
  "Richard the Lionheart", "Saladin", "Barbarossa",
  "Frederick II", "Innocent III",
  "Robert the Bruce", "William Wallace",
  "Jan Žižka", "John Hus",
  "Brian Boru",
  "Alfred the Great", "Æthelflæd", "Edmund Ironside",
  "Harald Bluetooth", "Canute the Great",

  // Early Modern European History
  "Henry VIII", "Anne Boleyn", "Catherine of Aragon", "Jane Seymour",
  "Mary Queen of Scots", "Elizabeth I", "Francis Drake", "Walter Raleigh",
  "Cardinal Wolsey", "Thomas Cromwell", "Thomas More",
  "Philip II of Spain", "Cervantes",
  "Galileo Galilei", "Copernicus", "Tycho Brahe", "Johannes Kepler",
  "Leonardo da Vinci", "Michelangelo", "Raphael",
  "Machiavelli", "Savonarola",
  "Columbus", "Vasco da Gama", "Magellan", "Cortés", "Pizarro",
  "Marco Polo", "Ibn Battuta",
  "Vlad the Impaler", "Stephen the Great",
  "Suleiman the Magnificent", "Roxelana", "Mehmed II", "Constantine XI",
  "Ivan the Terrible", "Boris Godunov",

  // 17th–19th Century History
  "Oliver Cromwell", "Charles I", "Cardinal Richelieu", "Mazarin",
  "Louis XIV", "Molière", "Racine", "Corneille",
  "Peter the Great", "Catherine the Great",
  "Frederick the Great", "Maria Theresa", "Joseph II",
  "Napoleon Bonaparte", "Josephine de Beauharnais", "Wellington",
  "Marie Antoinette", "Louis XVI", "Robespierre", "Danton", "Marat",
  "Talleyrand", "Fouché",
  "Lord Byron", "Percy Bysshe Shelley", "Mary Shelley",
  "Pocahontas", "Squanto", "Tecumseh", "Geronimo", "Sitting Bull",
  "Harriet Tubman",

  // Dante & Medieval Italian Literature
  "Dante Alighieri", "Beatrice Portinari", "Virgil the Guide",
  "Francesca da Rimini", "Paolo Malatesta", "Count Ugolino",
  "Farinata degli Uberti", "Brunetto Latini",

  // Chaucer
  "The Knight", "The Miller", "The Pardoner", "The Wife of Bath", "The Prioress",
  "The Monk", "The Franklin", "The Reeve", "The Summoner", "The Cook",
  "Troilus", "Criseyde", "Pandarus", "Diomede",

  // Shakespeare — Tragedies
  "Hamlet", "Ophelia", "Polonius", "Horatio", "Laertes", "Claudius", "Gertrude",
  "Macbeth", "Lady Macbeth", "Banquo", "Macduff", "Malcolm", "Duncan",
  "Iago", "Othello", "Desdemona", "Cassio", "Emilia", "Brabantio",
  "King Lear", "Cordelia", "Goneril", "Regan", "Edgar", "Edmund", "Gloucester",
  "Romeo", "Juliet", "Mercutio", "Benvolio", "Tybalt", "Friar Lawrence",
  "Timon", "Alcibiades", "Apemantus",
  "Coriolanus", "Volumnia", "Aufidius",
  "Antony", "Cleopatra", "Enobarbus", "Octavius Caesar", "Lepidus",
  "Brutus", "Cassius", "Caesar",
  "Titus Andronicus", "Lavinia", "Aaron", "Tamora",
  "Richard III", "Buckingham", "Anne Neville",
  "Richard II", "Henry Bolingbroke",

  // Shakespeare — Comedies
  "Prospero", "Miranda", "Ariel", "Caliban", "Ferdinand", "Gonzalo",
  "Oberon", "Titania", "Puck", "Bottom", "Peaseblossom",
  "Helena", "Hermia", "Lysander", "Demetrius",
  "Beatrice", "Benedick", "Hero", "Claudio", "Don Pedro", "Dogberry",
  "Portia", "Shylock", "Bassanio", "Antonio", "Gratiano", "Lorenzo", "Jessica",
  "Viola", "Orsino", "Olivia", "Malvolio", "Sir Toby Belch", "Sir Andrew Aguecheek",
  "Rosalind", "Orlando", "Jaques", "Touchstone", "Audrey",
  "Petruchio", "Katherine", "Bianca", "Baptista",
  "Falstaff", "Prince Hal", "Hotspur", "Mistress Quickly", "Pistol", "Nym",
  "Feste", "Maria",

  // Marlowe
  "Doctor Faustus", "Mephistopheles", "Helen of Troy",
  "Tamburlaine", "Zenocrate", "Bajazeth",
  "Edward II", "Gaveston",
  "Barabas the Jew of Malta",

  // Ben Jonson
  "Volpone", "Mosca", "Corbaccio", "Corvino", "Sir Epicure Mammon",
  "Alchemist Subtle", "Face", "Dol Common",

  // Cervantes & Spanish Literature
  "Don Quixote", "Sancho Panza", "Dulcinea del Toboso", "Rocinante",
  "Cardenio", "Dorotea", "Don Fernando",

  // French Literature (pre-1928)
  "Jean Valjean", "Javert", "Fantine", "Cosette", "Marius Pontmercy",
  "Éponine", "Thenardier", "Enjolras", "Gavroche", "Bishop Myriel",
  "Quasimodo", "Esmeralda", "Claude Frollo", "Phoebus", "Gringoire",
  "Athos", "Porthos", "Aramis", "d'Artagnan", "Cardinal Richelieu",
  "Milady de Winter", "Constance Bonacieux", "Buckingham", "Anne of Austria",
  "Edmond Dantès", "Mercedes", "Fernand Mondego", "Danglars", "Villefort",
  "Haydée", "Valentine de Villefort", "Maximilien Morrel", "Albert de Morcerf",
  "Monte Cristo",
  "Cyrano de Bergerac", "Roxane", "Christian de Neuvillette", "Le Bret",
  "Candide", "Cunégonde", "Pangloss", "Martin",
  "Manon Lescaut", "Des Grieux",
  "Emma Bovary", "Charles Bovary", "Léon Dupuis", "Rodolphe Boulanger",
  "Frédéric Moreau", "Madame Arnoux", "Rosanette",
  "Père Goriot", "Rastignac", "Vautrin", "Delphine de Nucingen",
  "Eugénie Grandet", "Félix Grandet",
  "Cousin Bette", "Baron Hulot", "Valérie Marneffe",
  "Nana", "Gervaise", "Coupeau", "Lantier",
  "Étienne Lantier", "Catherine Maheu", "Chaval",
  "Arsène Lupin",

  // German & Austrian Literature
  "Faust", "Mephistopheles", "Gretchen", "Wagner the Student",
  "Wilhelm Meister", "Mignon", "Philine",
  "Werther", "Lotte", "Albert",
  "Heinrich von Ofterdingen",
  "Undine", "Kühleborn",
  "Peter Schlemihl",
  "Coppelius", "Nathanael", "Olympia", "Clara",
  "Till Eulenspiegel",

  // Germanic Epic
  "Siegfried", "Brünnhilde", "Wotan", "Hagen", "Kriemhild", "Gunther",
  "Gudrun", "Etzel",

  // Italian Literature
  "Bradamante", "Ruggiero",
  "Godfrey of Bouillon", "Rinaldo of Este",
  "Armida", "Clorinda", "Tancredi",

  // English Literature — Spenser, Milton, Bunyan
  "Red Cross Knight", "Una", "Archimago", "Duessa",
  "Britomart", "Artegall", "Florimell", "Marinell",
  "Satan", "Beelzebub", "Moloch", "Adam", "Eve", "Raphael", "Michael",
  "Dalila", "Harapha", "Manoa",
  "Christian", "Apollyon", "Giant Despair", "Faithful", "Hopeful",
  "Worldly Wiseman",

  // Restoration & 18th-Century English
  "Robinson Crusoe", "Friday",
  "Gulliver", "King Brobdingnag", "Struldbrugs",
  "Moll Flanders",
  "Tom Jones", "Sophia Western", "Squire Western", "Allworthy", "Blifi",
  "Joseph Andrews", "Parson Adams", "Fanny",
  "Clarissa Harlowe", "Lovelace",
  "Pamela Andrews", "Mr. B",
  "Tristram Shandy", "Uncle Toby", "Corporal Trim", "Widow Wadman",
  "Humphry Clinker", "Matthew Bramble", "Lydia Melford",
  "Roderick Random", "Strap",
  "Peregrine Pickle", "Commodore Trunnion",

  // Gothic Literature
  "Dracula", "Van Helsing", "Jonathan Harker", "Mina Murray",
  "Lucy Westenra", "Renfield", "Arthur Holmwood", "Quincey Morris",
  "Frankenstein", "The Monster", "Walton",
  "Dr. Jekyll", "Mr. Hyde", "Utterson",
  "Dorian Gray", "Lord Henry Wotton", "Basil Hallward", "Sibyl Vane",
  "Heathcliff", "Catherine Earnshaw", "Edgar Linton", "Nelly Dean", "Hindley Earnshaw",
  "Jane Eyre", "Mr. Rochester", "Bertha Mason", "St. John Rivers", "Blanche Ingram",
  "Agnes Grey", "Helen Graham",
  "Rebecca", "Mrs. Danvers", "Maxim de Winter",
  "The Phantom of the Opera", "Christine Daaé", "Raoul de Chagny",
  "Monk Lewis", "Ambrosio", "Matilda",

  // Victorian Literature — Dickens
  "Oliver Twist", "Fagin", "Bill Sikes", "Nancy", "Artful Dodger",
  "Ebenezer Scrooge", "Bob Cratchit", "Tiny Tim", "Jacob Marley",
  "Ghost of Christmas Past", "Ghost of Christmas Present",
  "David Copperfield", "Agnes Wickfield", "Uriah Heep", "Micawber", "Steerforth", "Dora",
  "Nicholas Nickleby", "Smike", "Wackford Squeers",
  "Sydney Carton", "Charles Darnay", "Lucie Manette", "Madame Defarge", "Dr. Manette",
  "Pip", "Estella", "Miss Havisham", "Magwitch", "Herbert Pocket", "Joe Gargery",
  "Jarndyce", "Esther Summerson", "Lady Dedlock", "Inspector Bucket",
  "Mr. Pickwick", "Sam Weller", "Alfred Jingle",
  "Martin Chuzzlewit", "Pecksniff", "Tom Pinch", "Jonas Chuzzlewit",
  "Little Dorrit", "Arthur Clennam", "Rigaud",
  "Edwin Drood", "Rosa Bud", "Jasper",
  "Our Mutual Friend", "Bella Wilfer", "Eugene Wrayburn", "Bradley Headstone",

  // Victorian Literature — Thackeray
  "Becky Sharp", "Amelia Sedley", "Dobbin", "George Osborne", "Rawdon Crawley",
  "Lord Steyne", "Jos Sedley",

  // Victorian Literature — Austen
  "Elizabeth Bennet", "Mr. Darcy", "Jane Bennet", "Mr. Bingley",
  "Lydia Bennet", "Wickham", "Mr. Collins", "Lady Catherine de Bourgh", "Mrs. Bennet",
  "Emma Woodhouse", "Mr. Knightley", "Harriet Smith", "Frank Churchill", "Miss Bates",
  "Anne Elliot", "Captain Wentworth", "Mr. Elliot", "Lady Russell",
  "Elinor Dashwood", "Marianne Dashwood", "Edward Ferrars", "Colonel Brandon", "Willoughby",
  "Catherine Morland", "Henry Tilney", "Isabella Thorpe", "General Tilney",
  "Fanny Price", "Edmund Bertram", "Mary Crawford", "Henry Crawford", "Mrs. Norris",

  // Victorian Literature — Brontë
  "Agnes Grey", "Edward Weston",
  "Arthur Huntingdon",

  // Victorian Literature — Hardy
  "Tess Durbeyfield", "Angel Clare", "Alec d'Urberville",
  "Michael Henchard", "Lucetta Templeman", "Donald Farfrae",
  "Jude Fawley", "Sue Bridehead", "Arabella Donn",
  "Gabriel Oak", "Bathsheba Everdene", "Sergeant Troy", "Boldwood",

  // Victorian Literature — George Eliot
  "Dorothea Brooke", "Tertius Lydgate", "Casaubon", "Will Ladislaw", "Bulstrode",
  "Silas Marner", "Eppie", "Godfrey Cass",
  "Maggie Tulliver", "Tom Tulliver", "Philip Wakem", "Stephen Guest",

  // Victorian Literature — Trollope
  "Septimus Harding", "Mrs. Proudie", "Bishop Proudie",
  "Mr. Slope", "Eleanor Bold", "Archdeacon Grantly",
  "Plantagenet Palliser", "Lady Glencora",

  // Victorian — Wilkie Collins
  "Marian Halcombe", "Laura Fairlie", "Walter Hartright", "Count Fosco",
  "Sergeant Cuff",

  // Sherlock Holmes & Victorian Adventure
  "Sherlock Holmes", "Dr. Watson", "Irene Adler", "Professor Moriarty",
  "Mycroft Holmes", "Mrs. Hudson", "Lestrade", "Gregson",
  "Irene Norton", "Violet Hunter",
  "Long John Silver", "Jim Hawkins", "Captain Smollett", "Ben Gunn",
  "Squire Trelawney", "Dr. Livesey", "Blind Pew", "Israel Hands",
  "Alan Breck Stewart", "David Balfour", "Uncle Ebenezer",
  "Dr. Nikola",

  // Victorian Science Fiction
  "The Time Traveller", "Weena",
  "Griffin the Invisible Man",
  "Dr. Moreau", "Edward Prendick",
  "Cavor", "Mr. Bedford",

  // American Literature (pre-1928)
  "Huckleberry Finn", "Tom Sawyer", "Jim", "Aunt Polly", "Becky Thatcher",
  "Natty Bumppo", "Chingachgook", "Uncas", "Cora Munro", "Alice Munro",
  "Ichabod Crane", "Brom Bones", "Rip Van Winkle", "Katrina Van Tassel",
  "Hester Prynne", "Arthur Dimmesdale", "Roger Chillingworth", "Pearl",
  "Captain Ahab", "Ishmael", "Queequeg", "Starbuck", "Stubb",
  "Bartleby",
  "Isabel Archer", "Gilbert Osmond", "Madame Merle", "Lord Warburton", "Ralph Touchett",
  "Daisy Miller", "Winterbourne",
  "Lambert Strether", "Marie de Vionnet",
  "Milly Theale", "Merton Densher", "Kate Croy",
  "Maggie Verver", "Adam Verver", "Prince Amerigo",
  "George Babbitt",
  "Jay Gatsby", "Daisy Buchanan", "Tom Buchanan", "Nick Carraway", "Jordan Baker",
  "Ethan Frome", "Mattie Silver", "Zeena",
  "Sister Carrie", "Hurstwood",

  // American Folklore
  "John Henry", "Paul Bunyan", "Pecos Bill", "Johnny Appleseed",
  "Davy Crockett", "Daniel Boone", "Mike Fink",
  "Brer Rabbit", "Brer Fox", "Uncle Remus",
  "Calamity Jane", "Annie Oakley",
  "Buffalo Bill",

  // Russian Literature
  "Tatiana Larina", "Eugene Onegin", "Vladimir Lensky", "Olga Larina",
  "Natasha Rostova", "Sonya Rostova", "Pierre Bezukhov", "Andrei Bolkonsky",
  "Anna Karenina", "Levin", "Vronsky", "Stiva Oblonsky", "Dolly",
  "Raskolnikov", "Sonia Marmeladova", "Porfiry Petrovich", "Dunya",
  "Razumikhin", "Svidrigailov",
  "Prince Myshkin", "Nastasya Filippovna", "Rogozhin", "Aglaya",
  "Alyosha Karamazov", "Ivan Karamazov", "Dmitri Karamazov",
  "Father Zosima", "Smerdyakov", "Grushenka", "Lise",
  "Oblomov", "Stoltz", "Olga Ilyinskaya",
  "Bazarov", "Arkady Kirsanov", "Anna Odintsova",
  "Chichikov", "Manilov", "Sobakevich", "Nozdrev", "Korobochka",
  "Akaky Akakievich",
  "Podkolyosin", "Khlestakov",
  "Uncle Vanya", "Sonya Serebryakova", "Professor Serebryakov", "Astrov",
  "Olga Prozorov", "Masha Prozorov", "Irina Prozorov", "Vershinin",
  "Lopakhin", "Madame Ranevskaya", "Trofimov", "Gaev",

  // Scandinavian Literature
  "Brand", "Peer Gynt", "Solveig", "Anitra", "The Button Moulder",
  "Nora Helmer", "Torvald Helmer", "Krogstad",
  "Hedda Gabler", "George Tesman", "Judge Brack", "Thea Elvsted",
  "Master Builder Solness", "Hilde Wangel",
  "Johannes Rosmer", "Rebecca West (Rosmersholm)",
  "Kristin Lavransdatter", "Erlend Nikulaussøn",

  // Iberian & Latin Literature
  "Celestina", "Calisto", "Melibea",
  "Lazarillo de Tormes",
  "Segismundo",

  // Fairy Tales — Brothers Grimm
  "Cinderella", "Snow White", "Sleeping Beauty", "Rapunzel",
  "Red Riding Hood", "Goldilocks", "Hansel", "Gretel",
  "Rumpelstiltskin", "Tom Thumb", "Puss in Boots", "Beauty", "The Beast",
  "Bluebeard", "Fatima", "Sister Anne",
  "Donkeyskin", "Allerleirauh",
  "The Frog Prince", "The Brave Little Tailor",
  "Snow Queen", "Gerda", "Kai",
  "The Wild Swans", "Elise",
  "The Little Mermaid", "The Little Match Girl", "The Ugly Duckling",
  "Thumbelina", "The Tinderbox",
  "Mother Holle", "The Goose Girl",
  "The Six Swans", "The Twelve Dancing Princesses",
  "Allerleirauh",

  // Fairy Tales — Perrault
  "Cendrillon (Perrault)", "Little Red Riding Hood",

  // Hans Christian Andersen
  "The Steadfast Tin Soldier", "The Nightingale", "The Emperor",
  "The Ice Maiden", "Rudy",
  "Ole Lukoie", "The Shadow",

  // Victorian Children's Literature
  "Alice", "Mad Hatter", "Red Queen", "White Queen", "White Rabbit",
  "Cheshire Cat", "Caterpillar", "Tweedledee", "Tweedledum", "Humpty Dumpty",
  "Queen of Hearts", "Mock Turtle",
  "Dorothy Gale", "Toto", "Scarecrow", "Tin Man", "Cowardly Lion", "Glinda",
  "Wicked Witch of the West",
  "Peter Pan", "Wendy Darling", "Tinkerbell", "Captain Hook", "Tiger Lily",
  "Smee", "Nana",
  "Pinocchio", "Geppetto", "Jiminy Cricket", "Blue Fairy", "Stromboli",
  "Mowgli", "Baloo", "Bagheera", "Shere Khan", "Rikki-Tikki-Tavi",
  "Kaa", "King Louie", "Akela",
  "Kim", "Mahbub Ali", "Lurgan Sahib", "Colonel Creighton",
  "Elephant's Child (Kipling)",
  "Winnie-the-Pooh", "Piglet", "Eeyore", "Kanga", "Roo", "Tigger", "Owl",
  "Christopher Robin",

  // 20th-Century (pre-1928) Literature
  "Swann", "Odette", "Albertine", "Charlus", "Marcel (In Search of Lost Time)",
  "Stephen Dedalus", "Leopold Bloom", "Molly Bloom",
  "Gregor Samsa", "Grete Samsa",
  "Joseph K", "The Surveyor K",
  "Severin von Kusiemski", "Wanda",
  "Adrian Leverkühn",

  // More Greek Myth (extended)
  "Hyacinthus", "Zephyrus", "Apollo",
  "Glaucus", "Scylla",
  "Caeneus", "Caenus",
  "Procne", "Philomela", "Tereus",
  "Ceyx", "Alcyone",
  "Erysichthon",
  "Cycnus",
  "Macaria",
  "Deucalion", "Pyrrha",
  "Cadmus", "Harmonia",
  "Ino", "Athamas", "Melicertes",
  "Autonoë", "Autonoe",
  "Agave",
  "Phineas", "Cleopatra (Greek mythology)",
  "Zetes", "Calais",
  "Mopsus", "Amphiaraus",
  "Castor", "Pollux",
  "Clytia",
  "Leander", "Hero",

  // More Norse (extended)
  "Skrymir", "Utgarða-Loki",
  "Thrym",
  "Hrungnir",
  "Alvíss",
  "Þorgerðr Hölgabrúðr",
  "Járnsaxa",

  // Additional Historical Figures
  "Archimedes of Syracuse",
  "Pytheas",
  "Eratosthenes",
  "Strabo",
  "Diogenes",
  "Epicurus",
  "Marcus Tullius Cicero",
  "Seneca",
  "Epictetus",
  "Marcus Aurelius",
  "Hypatia",
  "Zenobia of Palmyra",
  "Zenodotus",
  "Ptolemy the Astronomer",
  "Avicenna",
  "Al-Kindi",
  "Al-Khwarizmi",
  "Omar Khayyam",
  "Rumi",
  "Hafiz",
  "Ferdowsi",

  // More World Literature
  "Urashima", "The Bamboo Cutter", "Lady Heike",
  "Genji", "Lady Murasaki",
  "Tale of Heike", "Yoshinaka",
  "Rashomon",
  "Sakuntala", "Dushyanta",
  "Shakuntala", "King Dushyanta",
  "Vikramaditya", "Vetala",
  "Raja Harishchandra",
  "Nala", "Damayanti",
  "Savitri", "Satyavan",
];

// Deduplicate while preserving order
const seen = new Set<string>();
const uniqueCharacterNames: string[] = [];
for (const name of characterNames) {
  const trimmed = name.trim();
  if (trimmed && !seen.has(trimmed)) {
    seen.add(trimmed);
    uniqueCharacterNames.push(trimmed);
  }
}

export default uniqueCharacterNames;
