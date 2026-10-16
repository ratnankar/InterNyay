import Icon from './Icon'

// Round avatar. With a photo: clicking the photo opens it full size, and the camera badge changes it.
// Without a photo: the default person avatar shows, and clicking anywhere on it uploads one.
export default function AvatarUpload({ className, photo, alt, uploadTitle, onFile, onView }) {
  if (!photo) {
    return (
      <label className={`${className} avatar-upload`} title={uploadTitle}>
        <Icon name="user" />
        <span className="avatar-upload__badge"><Icon name="camera" /></span>
        <input type="file" accept="image/*" className="avatar-upload__input" onChange={onFile} />
      </label>
    )
  }

  return (
    <div className={`${className} avatar-upload avatar-upload--photo`}>
      <img
        src={photo}
        alt={alt}
        className="avatar-upload__photo"
        title="View full size"
        role="button"
        tabIndex={0}
        onClick={onView}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
      />
      <label className="avatar-upload__badge avatar-upload__badge--action" title="Change photo">
        <Icon name="camera" />
        <input type="file" accept="image/*" className="avatar-upload__input" onChange={onFile} />
      </label>
    </div>
  )
}
