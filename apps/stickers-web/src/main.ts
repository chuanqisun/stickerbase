import embeddingUrl from "../../../data/embeddings.bin?url";
import "./style.css";

console.log(embeddingUrl);

// Use eigen-db (already in package.json, https://github.com/chuanqisun/eigen-db) to import the embedding binary file from the url
// The db binary file is available in public/embeddings.bin
// - ideally show import progress, if available
// Add password input box (disable autofill or any password manage integration)
// - allow user to enter gemini api key
// - sync with localstorage
// A textarea where user can type in any text
// User clicks match, the following process happens
// - The user input text is embedded for querying against the vector db. Use gemini embeddings 2 model for the query. The documents are already embedded, see scripts/03-embed/01-embed.ts. Follow documents in https://ai.google.dev/gemini-api/docs/embeddings to figure out the best way to embed the query against the corpus of images.
// - The top k nearest matches are retrieved, make k count and min similarity adjustable
// - The results are grouped by laptop images, not individual sticker images
// - Sort the resulting laptop images by the highest sticker match score within the image
// - Draw visual overlay on the laptop images, highlighting the bounding box and match score of the matches in that image. Some laptop image may have more than 1 highlights
// - The entire system should respond to user input live, as user types, adjust k, and similarity limit, the result should update in realtime
// All the laptop images data and bounding box data are in public/images folder. You need to result the filenames at runtime for perf reasons
// You may use rxjs to handle async behavior
// You may use lit's render function and html template literals to handle templating and event binding
