// @ts-nocheck 
'use client'
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { BsPatchPlus } from 'react-icons/bs';

export default function ImageUplod() {
    const [logoImage, setLogoImage] = useState(null);
    const [featuredImage, setFeaturedImage] = useState(null);
    const [galleryImage, setGalleryImage] = useState(null);
  
    const createOnDropHandler = (setter) =>
      useCallback((acceptedFiles) => {
        acceptedFiles.forEach((file) => {
          const reader = new FileReader();
  
          reader.onload = () => {
            const dataUrl = reader.result;
            setter(dataUrl); 
          };
  
          reader.readAsDataURL(file);
        });
      }, [setter]);
  
    const { getRootProps: getLogoRootProps, getInputProps: getLogoInputProps } = useDropzone({
      onDrop: createOnDropHandler(setLogoImage),
    });
  
    const { getRootProps: getFeaturedRootProps, getInputProps: getFeaturedInputProps } = useDropzone({
      onDrop: createOnDropHandler(setFeaturedImage),
    });
  
    const { getRootProps: getGalleryRootProps, getInputProps: getGalleryInputProps } = useDropzone({
      onDrop: createOnDropHandler(setGalleryImage),
    });
  
    const renderDropzone = (imageSrc, getRootProps, getInputProps) => (
      <div {...getRootProps()} className="dropzone dz-clickable p-4 my-3">
        <input {...getInputProps()} />
        {!imageSrc ? (
          <>
            <div className="text-center">
              <BsPatchPlus className='fs-2 mb-3'/>
            </div>
            <p className="text-center">Drop files here to upload</p>
          </>
        ) : (
          <div>
            <img src={imageSrc} alt="Uploaded" style={{ width: '100%', height: 'auto' }} />
          </div>
        )}
      </div>
    );
return (
    <div className="card-body">
    <div className="row g-4">
      <div className="col-lg-4 col-md-6">
        <label className="lableTitle">Upload Logo</label>
        {renderDropzone(logoImage, getLogoRootProps, getLogoInputProps)}
        <label className="smart-text text-md">Maximum file size: 2 MB.</label>
      </div>

      <div className="col-lg-4 col-md-6">
        <label className="lableTitle">Featured Image</label>
        {renderDropzone(featuredImage, getFeaturedRootProps, getFeaturedInputProps)}
        <label className="smart-text text-md">Maximum file size: 2 MB.</label>
      </div>

      <div className="col-lg-4 col-md-12">
        <label className="lableTitle">Image Gallery</label>
        {renderDropzone(galleryImage, getGalleryRootProps, getGalleryInputProps)}
        <label className="smart-text text-md">Maximum file size: 2 MB.</label>
      </div>
    </div>
  </div>
  )
}
