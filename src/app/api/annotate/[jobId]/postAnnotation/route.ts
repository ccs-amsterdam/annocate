// efficient and safe way to post annotations:
// only post the change to the annotation: so create IDs and delete IDs.
// (make it so annotations cannot be updated, only created or deleted)
// perform this change directly in postgres jsonb column, and return
// the updated annotation. Then compare hash of this updated annotation
// with hash on client. If they are the same, the annotation was updated.
