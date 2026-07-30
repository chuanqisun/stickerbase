// Add folder: data/images/
// Convert all the images in images/ to webp, without changing dimensions and output them in data/images/<original-filename>.<original-extension>.webp
// Alongside the webp output image, add a metadata file: data/images/<original-filename>.<original-extension>.json
// The metadata file should contain a map from filename to bounding box: <image-index>.webp -> [x,y,w,h]. The bounding box data is available in data/stickers/<filename>.<ext>/index.json
// This script should overwrite any existing output in the data/images/
