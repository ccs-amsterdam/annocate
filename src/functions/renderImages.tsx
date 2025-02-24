import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { ProcessedImageField, RenderedImages } from "@/app/types";

const StyledFigure = styled.figure<{ hasCaption: boolean }>`
  display: flex;
  flex-direction: column;
  text-align: center;
  place-self: center;

  & figcaption {
    margin: auto;
    padding: 0.5rem;
    height: ${(p) => (p.hasCaption ? 50 : 0)}px;
  }
`;

const StyledImg = styled.img<{ size: Size; fixedSize?: Size }>`
  border: 2px solid transparent; // DON"T CHANGE BORDER WIDTH WITHOUT ADJUSTING OFFSET IN getImagePosition.js
  margin: auto;
  background: white;
  max-width: 100%;
  width: ${(p) => p.fixedSize?.width || `${p.size.width} + px`};
  height: ${(p) => p.fixedSize?.height || `${p.size.height} + px`};
`;

/** Simple interface for image size */
interface Size {
  height: string | undefined;
  width: string | undefined;
}

/** Returns a record where keys are image field names and values are react elements that render the image */
export default function renderImages(
  image_fields: ProcessedImageField[],
  setImagesLoaded: (loaded: boolean) => any,
  containerRef: any,
): RenderedImages {
  const images: RenderedImages = {};

  setImagesLoaded(image_fields.length === 0);

  const imagesLoaded: boolean[] = Array(image_fields.length).fill(false);
  function onImageLoad(index: number) {
    imagesLoaded[index] = true;
    if (!imagesLoaded.some((i) => !i)) setImagesLoaded(true);
  }

  for (let i = 0; i < image_fields.length; i++) {
    const imageField = image_fields[i];
    images[imageField.name] = (
      <AnnotatableImage
        key={"image-" + imageField.name}
        ref={containerRef}
        imageField={imageField}
        onImageLoad={() => onImageLoad(i)}
      />
    );
  }
  return images;
}

interface AnnotatableImageProps {
  imageField: ProcessedImageField;
  onImageLoad: () => any;
}

const AnnotatableImage = React.forwardRef(({ imageField, onImageLoad }: AnnotatableImageProps, ref) => {
  const container = ref;
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<Size>({ height: undefined, width: undefined });
  const extraspace = imageField.caption ? 56 : 6; // reserve 50 px for caption + 6 for border

  useEffect(() => {
    const onResize = () => updateImageSize(img, container, setSize, extraspace);

    onResize();
    // Listen for changes to screen size and orientation
    window.addEventListener("resize", onResize);
    if (window?.screen?.orientation) {
      window.screen.orientation?.addEventListener("change", onResize);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (window?.screen?.orientation) {
        window.screen.orientation.removeEventListener("change", onResize);
      }
    };
  }, [extraspace, container, img]);

  useEffect(() => {
    if (img?.current?.complete) onImageLoad();
  }, [img, onImageLoad]);

  // value should not be an array, because this is resolved in unfoldFields,
  // but typescript doesn't catch that.
  const value = Array.isArray(imageField.value) ? imageField.value[0] : imageField.value;
  let src = imageField.base64 ? `data:image/jpeg;base64,${value}` : value;

  return (
    <StyledFigure
      className="field"
      hasCaption={!!imageField.caption}
      style={{
        gridArea: imageField.grid_area,
        ...imageField?.style,
      }}
    >
      <StyledImg
        ref={img}
        size={size}
        draggable={false}
        className="AnnotatableImage"
        onLoad={() => {
          onImageLoad();
          updateImageSize(img, container, setSize, extraspace);
        }}
        onError={() => onImageLoad()}
        data-imagefieldname={imageField.name}
        key={imageField.name}
        alt={imageField.alt}
        src={src}
      />
      <figcaption>{imageField.caption}</figcaption>
    </StyledFigure>
  );
});
AnnotatableImage.displayName = "AnnotatableImage";

const updateImageSize = (img: any, container: any, setSize: (value: Size) => void, bottomSpace = 0) => {
  if (!img.current || !container.current) return;
  const [ih, iw] = [img.current.naturalHeight - bottomSpace, img.current.naturalWidth];
  const [ch, cw] = [container.current.clientHeight - bottomSpace, container.current.clientWidth];
  const byHeight = ih / iw > ch / cw;
  if (byHeight) {
    setSize({ height: Math.min(ch, ih) + "px", width: "auto" });
  } else {
    setSize({ width: Math.min(cw, iw) + "px", height: "auto" });
  }
};
