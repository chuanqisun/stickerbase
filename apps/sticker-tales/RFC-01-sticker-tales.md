## Experience requirment

- User open the website, asked to upload a photo of their laptop cover with stickers on it
- After the upload, the system scans the photo and automatically segments the stickers from the image (SAM 3.1)
- User can click and select specific stickers to record a story about the sticker
- When user finishes recording for all the stickers they want to talk about, they submit
- The system detects other stickers, opens a "My connections" view, where that are visually similar to the ones in the user submitted photo. User can click and select to listen to the stories
- User can navigates to "All stories" view to browse all the laptop images
- User can navigate to "My stories" view to edit their submission

## Technical

- For demo purpose, the initial UI also prompts for gemini api key and fal.ai api key. Those are saved in local storage for repeating demos
- You can use origin private file system to store the DB file, sounds, images, and metadata. Provide utility for user to reset the files
- User start from empty DB, or update an existing DB file. Use `eigen-db` library
- User can upload laptop image, record and submit
- During submit, all the images from the laptop will be embedded with Gemini Embedding 2, and inserted into the DB
- In the UI, we expose a button to let user download the DB. The downloaded DB can be used for future demos

## Reference links

- eigen-db: https://github.com/Eigen-DB/eigen-db
- gemini-embedding-2: https://ai.google.dev/gemini-api/docs/embeddings
- SAM 3.1 by fal.ai: https://fal.ai/models/fal-ai/sam-3-1/image/llms.txt
- You can look into ../stickers-web app for how to structure of similar app. That app is more complex and doesn't have voice recording. This app should be much simpler but with added voice recording/playing feature.
- You can look into ../../scripts for how to use gemini-embedding-2 and eigen-db to index stickers
