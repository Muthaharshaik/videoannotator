import { createElement, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import CryptoJS from "crypto-js";
import "./ui/Videoannotator.css";

// Portal wrapper to render modals outside Mendix layout
const AnnotationPortal = ({ children }) => {
    return createPortal(children, document.body);
};

// Global counter for widget instances
let globalWidgetCounter = 0;

export default function Videoannotator({ 
    awsAccessKey,
    awsSecretKey, 
    awsRegion,
    awsSessionToken,
    s3BucketName,
    s3FileName,
    userName,
    videoAnnotations,
    onAnnotationAdd,
    onAnnotationDelete,
    allowAnnotations,
    annotationMode,
    referenceDocuments,
    name, 
    tabIndex, 
    style,
    ...otherProps
}) {
    // Handle class prop from Mendix Studio Pro
    const className = otherProps.class || otherProps.className || '';
    
    // ENHANCED: Ultra-unique widget instance ID
    const [widgetInstanceId] = useState(() => {
        globalWidgetCounter++;
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substr(2, 16);
        const counterPart = globalWidgetCounter.toString().padStart(6, '0');
        const processId = typeof window !== 'undefined' ? window.performance.now().toString().replace('.', '') : '0';
        const uniqueHash = Math.random().toString(36).substr(2, 8);
        return `video-widget-${counterPart}-${timestamp}-${randomPart}-${processId}-${uniqueHash}`;
    });
    
    // Multiple isolated refs for complete widget separation
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const richTextRef = useRef(null);
    const searchInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const containerRef = useRef(null);
    const refDocDropdownRef = useRef(null);
    const videoContainerRef = useRef(null);
    const videoOverlaysRef = useRef(null); // NEW: Ref for video overlays container
    
    // Core media state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [mediaReady, setMediaReady] = useState(false);
    const [mediaUrl, setMediaUrl] = useState(null);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaError, setMediaError] = useState(null);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [isAudioFile, setIsAudioFile] = useState(false);
    
    // ENHANCED: Video dimensions and rendering area tracking with container position
    const [videoDimensions, setVideoDimensions] = useState({ 
        width: 0, 
        height: 0, 
        aspectRatio: 1,
        renderWidth: 0,
        renderHeight: 0,
        offsetX: 0,
        offsetY: 0,
        containerLeft: 0,  // NEW: Container position
        containerTop: 0    // NEW: Container position
    });
    
    // Maximize/Minimize state
    const [isMaximized, setIsMaximized] = useState(false);
    
    // Annotation state
    const [annotations, setAnnotations] = useState([]);
    const [annotationModeActive, setAnnotationModeActive] = useState(false);
    const [selectedAnnotation, setSelectedAnnotation] = useState(null);
    const [activeAnnotationId, setActiveAnnotationId] = useState(null);
    
    // Modal state
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [comment, setComment] = useState('');
    const [selectedReferenceDoc, setSelectedReferenceDoc] = useState('');
    const [pendingAnnotation, setPendingAnnotation] = useState(null);
    const [editingAnnotation, setEditingAnnotation] = useState(null);
    
    // Form state
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // File upload state
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [richTextContent, setRichTextContent] = useState('');
    
    // File preview state
    const [showFilePreview, setShowFilePreview] = useState(false);
    const [previewFile, setPreviewFile] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    
    // Reference document search state
    const [referenceSearchTerm, setReferenceSearchTerm] = useState('');
    const [showReferenceDropdown, setShowReferenceDropdown] = useState(false);
    const [selectedReferenceDocName, setSelectedReferenceDocName] = useState('');
    
    // UI state
    const [showAnnotationDropdown, setShowAnnotationDropdown] = useState(false);
    const [canAddAnnotations, setCanAddAnnotations] = useState(true);
    const [referenceDocList, setReferenceDocList] = useState([]);
    
    // Read more/less state for annotations
    const [expandedAnnotations, setExpandedAnnotations] = useState(new Set());
    
    // User info
    const currentUser = userName?.value || userName || "User";
    
    const MAX_COMMENT_LENGTH = 100;
    const ANNOTATION_COLOR = '#3B82F6';

    // ENHANCED: Debug logging function (from Image Annotator)
    const addDebugLog = useCallback((message) => {
        console.log(`[Widget ${widgetInstanceId}] ${message}`);
    }, [widgetInstanceId]);

    // ENHANCED: Execute Mendix microflow with proper error handling (from Image Annotator)
    const executeMendixAction = useCallback((action, actionName) => {
        if (!action) {
            addDebugLog(`⚠️ ${actionName} action not configured`);
            return false;
        }

        addDebugLog(`📞 Executing ${actionName} microflow...`);
        
        try {
            // Method 1: Check if action has execute method (common pattern)
            if (action && typeof action.execute === 'function') {
                addDebugLog(`🎯 Calling ${actionName} via execute() method`);
                action.execute();
                addDebugLog(`✅ ${actionName} microflow executed successfully via execute()`);
                return true;
            }
            
            // Method 2: Direct function call
            else if (typeof action === 'function') {
                addDebugLog(`🎯 Calling ${actionName} as direct function`);
                action();
                addDebugLog(`✅ ${actionName} microflow executed successfully as function`);
                return true;
            }
            
            // Method 3: Check if action is an object with other callable methods
            else if (action && typeof action === 'object') {
                addDebugLog(`🔍 ${actionName} is object, checking for callable methods`);
                
                // Try common Mendix action patterns
                if (typeof action.call === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via call() method`);
                    action.call();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via call()`);
                    return true;
                }
                
                if (typeof action.invoke === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via invoke() method`);
                    action.invoke();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via invoke()`);
                    return true;
                }
                
                // Log available methods for debugging
                const availableMethods = Object.getOwnPropertyNames(action).filter(prop => typeof action[prop] === 'function');
                addDebugLog(`🔍 Available methods on ${actionName}: ${availableMethods.join(', ')}`);
            }
            
            addDebugLog(`❌ ${actionName} action exists but no valid execution method found`);
            addDebugLog(`🔍 ${actionName} type: ${typeof action}, constructor: ${action?.constructor?.name}`);
            
            return false;
            
        } catch (error) {
            addDebugLog(`❌ Error executing ${actionName} microflow: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] ${actionName} execution error:`, error);
            return false;
        }
    }, [addDebugLog, widgetInstanceId]);

    // ENHANCED: Widget mount/unmount logging with microflow configuration check
    useEffect(() => {
        console.log(`🚀 [Widget ${widgetInstanceId}] VideoAnnotator initialized`);
        addDebugLog("=== MICROFLOW CONFIGURATION CHECK ===");
        addDebugLog(`onAnnotationAdd configured: ${!!onAnnotationAdd}`);
        addDebugLog(`onAnnotationDelete configured: ${!!onAnnotationDelete}`);
        
        if (onAnnotationAdd) {
            addDebugLog(`onAnnotationAdd type: ${typeof onAnnotationAdd}`);
            addDebugLog(`onAnnotationAdd constructor: ${onAnnotationAdd?.constructor?.name}`);
            addDebugLog(`onAnnotationAdd has execute: ${typeof onAnnotationAdd?.execute === 'function'}`);
        }
        
        if (onAnnotationDelete) {
            addDebugLog(`onAnnotationDelete type: ${typeof onAnnotationDelete}`);
            addDebugLog(`onAnnotationDelete constructor: ${onAnnotationDelete?.constructor?.name}`);
            addDebugLog(`onAnnotationDelete has execute: ${typeof onAnnotationDelete?.execute === 'function'}`);
        }
        addDebugLog("=== END MICROFLOW CONFIGURATION CHECK ===");
        
        return () => {
            console.log(`🔥 [Widget ${widgetInstanceId}] VideoAnnotator unmounted`);
            if (fileInputRef.current) {
                console.log(`🧹 [Widget ${widgetInstanceId}] Cleaning up file input ref`);
            }
        };
    }, [widgetInstanceId, onAnnotationAdd, onAnnotationDelete, addDebugLog]);

    // Log current user
    useEffect(() => {
        console.log(`👤 [Widget ${widgetInstanceId}] VideoAnnotator received user:`, currentUser);
        console.log(`🔒 [Widget ${widgetInstanceId}] User access control - canAddAnnotations:`, canAddAnnotations);
    }, [currentUser, canAddAnnotations, widgetInstanceId]);

    // Handle maximize/minimize toggle
    const handleMaximizeToggle = useCallback(() => {
        const newMaximizedState = !isMaximized;
        console.log(`🔄 [Widget ${widgetInstanceId}] Toggling maximize: ${isMaximized} -> ${newMaximizedState}`);
        setIsMaximized(newMaximizedState);
        
        // Recalculate video dimensions after view change
        setTimeout(() => {
            if (videoRef.current && !isAudioFile) {
                calculateVideoRenderingArea();
            }
        }, 350); // Wait for transition to complete
    }, [isMaximized, widgetInstanceId, isAudioFile]);

    // Handle escape key to exit maximize mode
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && isMaximized) {
                setIsMaximized(false);
                console.log(`⌨️ [Widget ${widgetInstanceId}] Escape key pressed - exiting maximize mode`);
            }
        };

        if (isMaximized) {
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isMaximized, widgetInstanceId]);

    // FIXED: Enhanced video rendering area calculation with proper container positioning
    const calculateVideoRenderingArea = useCallback(() => {
        if (!videoRef.current || isAudioFile) return;
        
        const video = videoRef.current;
        const containerRect = video.getBoundingClientRect();
        
        // Get actual video dimensions
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        if (videoWidth === 0 || videoHeight === 0) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Video dimensions not available yet`);
            return;
        }
        
        // Calculate aspect ratios
        const videoAspectRatio = videoWidth / videoHeight;
        const containerAspectRatio = containerRect.width / containerRect.height;
        
        let renderWidth, renderHeight, offsetX, offsetY;
        
        // Using object-fit: contain logic
        if (videoAspectRatio > containerAspectRatio) {
            // Video is wider - fit to width, letterbox top/bottom
            renderWidth = containerRect.width;
            renderHeight = containerRect.width / videoAspectRatio;
            offsetX = 0;
            offsetY = (containerRect.height - renderHeight) / 2;
        } else {
            // Video is taller - fit to height, letterbox left/right
            renderWidth = containerRect.height * videoAspectRatio;
            renderHeight = containerRect.height;
            offsetX = (containerRect.width - renderWidth) / 2;
            offsetY = 0;
        }
        
        const newDimensions = {
            width: videoWidth,
            height: videoHeight,
            aspectRatio: videoAspectRatio,
            renderWidth,
            renderHeight,
            offsetX,
            offsetY,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            // FIXED: Store absolute container position for accurate positioning
            containerLeft: containerRect.left,
            containerTop: containerRect.top
        };
        
        setVideoDimensions(newDimensions);
        
        console.log(`🔍 [Widget ${widgetInstanceId}] Video rendering area calculated:`, {
            original: { width: videoWidth, height: videoHeight },
            container: { width: containerRect.width, height: containerRect.height },
            containerPosition: { left: containerRect.left, top: containerRect.top },
            rendered: { width: renderWidth, height: renderHeight },
            offset: { x: offsetX, y: offsetY },
            aspectRatio: videoAspectRatio
        });
        
    }, [isAudioFile, widgetInstanceId]);

    // ENHANCED: Video load handler with proper dimension tracking
    const handleLoadedMetadata = useCallback(() => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement) {
            setDuration(mediaElement.duration);
            setMediaReady(true);
            setMediaLoaded(true);
            
            // Calculate video rendering area for videos
            if (!isAudioFile && videoRef.current) {
                setTimeout(() => {
                    calculateVideoRenderingArea();
                }, 100); // Small delay to ensure video is rendered
                
                console.log(`🎬 [Widget ${widgetInstanceId}] Video loaded successfully`);
            } else {
                console.log(`🎵 [Widget ${widgetInstanceId}] Audio loaded successfully - Duration: ${mediaElement.duration}s`);
            }
        }
    }, [isAudioFile, widgetInstanceId, calculateVideoRenderingArea]);

    // ENHANCED: More frequent recalculation triggers for position accuracy
    useEffect(() => {
        const handleResize = () => {
            if (!isAudioFile && videoRef.current && mediaReady) {
                setTimeout(() => {
                    calculateVideoRenderingArea();
                }, 100);
            }
        };

        const handleScroll = () => {
            if (!isAudioFile && videoRef.current && mediaReady) {
                setTimeout(() => {
                    calculateVideoRenderingArea();
                }, 50);
            }
        };

        // FIXED: Add more event listeners to catch position changes
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleScroll, true); // Use capture phase
        document.addEventListener('scroll', handleScroll, true); // Document scroll
        
        // Also recalculate on any layout change
        const observer = new MutationObserver(() => {
            if (!isAudioFile && videoRef.current && mediaReady) {
                setTimeout(() => {
                    calculateVideoRenderingArea();
                }, 100);
            }
        });

        if (containerRef.current) {
            observer.observe(containerRef.current, {
                attributes: true,
                attributeFilter: ['style', 'class'],
                subtree: true
            });
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('scroll', handleScroll, true);
            observer.disconnect();
        };
    }, [calculateVideoRenderingArea, isAudioFile, mediaReady]);

    // NEW: Additional position recalculation on widget interactions
    useEffect(() => {
        if (!isAudioFile && videoRef.current && mediaReady) {
            // Recalculate when maximized state changes
            setTimeout(() => {
                calculateVideoRenderingArea();
            }, 100);
        }
    }, [isMaximized, calculateVideoRenderingArea, isAudioFile, mediaReady]);

    // Function to detect if file is audio based on extension
    const detectFileType = useCallback((fileName) => {
        if (!fileName) return false;
        const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
        const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        const isAudio = audioExtensions.includes(extension);
        console.log(`🎵 [Widget ${widgetInstanceId}] File type detection:`, fileName, isAudio ? 'AUDIO' : 'VIDEO');
        return isAudio;
    }, [widgetInstanceId]);

    // Toggle annotation expansion
    const toggleAnnotationExpansion = useCallback((annotationId) => {
        setExpandedAnnotations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(annotationId)) {
                newSet.delete(annotationId);
            } else {
                newSet.add(annotationId);
            }
            return newSet;
        });
    }, []);

    // Check if annotation text should be truncated - ALWAYS return true to show Read More for all
    const shouldTruncateAnnotation = useCallback(() => {
        return true;
    }, []);

    // Get truncated text for annotations
    const getTruncatedText = useCallback((annotation) => {
        const plainText = annotation.richTextContent ? 
            annotation.richTextContent.replace(/<[^>]*>/g, '') : 
            annotation.comment;
        
        const truncated = plainText.length > MAX_COMMENT_LENGTH ? 
            plainText.substring(0, MAX_COMMENT_LENGTH) + '...' : 
            plainText;
            
        return annotation.richTextContent ? 
            `<p>${truncated}</p>` : 
            truncated;
    }, []);
    
    // Filtered reference documents based on search term
    const filteredReferenceDocList = useCallback(() => {
        if (!referenceSearchTerm.trim()) {
            return referenceDocList;
        }
        return referenceDocList.filter(doc => 
            doc.name.toLowerCase().includes(referenceSearchTerm.toLowerCase())
        );
    }, [referenceDocList, referenceSearchTerm]);
    
    // Enhanced URL encoding for S3 keys
    const encodeS3Key = useCallback((key) => {
        let decodedKey;
        try {
            decodedKey = decodeURIComponent(key);
        } catch (e) {
            decodedKey = key;
        }
        
        const pathParts = decodedKey.split('/');
        const encodedParts = pathParts.map(part => {
            return encodeURIComponent(part)
                .replace(/[!'()*]/g, function(c) {
                    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
                })
                .replace(/\(/g, '%28')
                .replace(/\)/g, '%29')
                .replace(/\[/g, '%5B')
                .replace(/\]/g, '%5D')
                .replace(/\{/g, '%7B')
                .replace(/\}/g, '%7D')
                .replace(/\#/g, '%23')
                .replace(/\?/g, '%3F')
                .replace(/\&/g, '%26')
                .replace(/\=/g, '%3D')
                .replace(/\+/g, '%2B')
                .replace(/%20/g, '%20');
        });
        
        return encodedParts.join('/');
    }, []);

    // Parse reference documents
    useEffect(() => {
        try {
            let docData = null;
            if (referenceDocuments && referenceDocuments.value !== undefined) {
                docData = referenceDocuments.value;
            } else if (typeof referenceDocuments === 'string') {
                docData = referenceDocuments;
            }
            
            if (docData && typeof docData === 'string' && docData.trim() !== '' && docData !== '[]') {
                try {
                    const parsed = JSON.parse(docData);
                    const mappedDocs = Array.isArray(parsed) ? parsed.map(doc => ({
                        id: String(doc.FileID),
                        name: doc.Name,
                        link: doc.Link
                    })) : [];
                    setReferenceDocList(mappedDocs);
                    console.log(`📄 [Widget ${widgetInstanceId}] Reference documents loaded:`, mappedDocs.length);
                } catch (parseError) {
                    console.warn(`⚠️ [Widget ${widgetInstanceId}] Failed to parse reference documents JSON:`, parseError);
                    setReferenceDocList([]);
                }
            } else {
                setReferenceDocList([]);
            }
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error loading reference documents:`, error);
            setReferenceDocList([]);
        }
    }, [referenceDocuments, widgetInstanceId]);
    
    // Enhanced custom editability effect
    useEffect(() => {
        let shouldShowButton = true;
        
        if (allowAnnotations !== undefined && allowAnnotations !== null) {
            if (allowAnnotations.value !== undefined) {
                shouldShowButton = allowAnnotations.value === true;
            } else {
                shouldShowButton = allowAnnotations === true;
            }
        } else if (annotationMode !== undefined && annotationMode !== null) {
            let modeValue = annotationMode.value || annotationMode;
            if (typeof modeValue === 'string') {
                const mode = modeValue.toUpperCase();
                if (mode === 'DISABLED' || mode === 'DISABLE' || mode === 'FALSE' || mode === 'READ_ONLY' || mode === 'READONLY') {
                    shouldShowButton = false;
                }
            }
        }
        
        setCanAddAnnotations(shouldShowButton);
        console.log(`🔒 [Widget ${widgetInstanceId}] Annotations access updated:`, shouldShowButton);
    }, [allowAnnotations, annotationMode, widgetInstanceId]);

    // Check if current user can edit/delete an annotation
    const canEditAnnotation = useCallback((annotation) => {
        return annotation.user === currentUser;
    }, [currentUser]);

    // Enhanced AWS Signature V4 implementation
    const generateSignedUrl = useCallback(async (bucket, key, region, accessKey, secretKey, sessionToken) => {
        try {
            console.log(`🔗 [Widget ${widgetInstanceId}] Generating signed URL for:`, { bucket, key: key.substring(0, 50) + '...' });
            
            const method = 'GET';
            const service = 's3';
            const endpoint = `https://${bucket}.s3.${region}.amazonaws.com`;
            
            const encodedKey = encodeS3Key(key);
            const canonicalUri = `/${encodedKey}`;
            
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
            const dateStamp = amzDate.substr(0, 8);
            
            const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
            const algorithm = 'AWS4-HMAC-SHA256';
            
            const queryParams = new URLSearchParams();
            queryParams.set('X-Amz-Algorithm', algorithm);
            queryParams.set('X-Amz-Credential', `${accessKey}/${credentialScope}`);
            queryParams.set('X-Amz-Date', amzDate);
            queryParams.set('X-Amz-Expires', '3600');
            queryParams.set("X-Amz-Security-Token", sessionToken);
            queryParams.set('X-Amz-SignedHeaders', 'host');
            
            const canonicalQuerystring = queryParams.toString();
            const canonicalHeaders = `host:${bucket}.s3.${region}.amazonaws.com\n`;
            const signedHeaders = 'host';
            const payloadHash = 'UNSIGNED-PAYLOAD';
            
            const canonicalRequest = [
                method,
                canonicalUri,
                canonicalQuerystring,
                canonicalHeaders,
                signedHeaders,
                payloadHash
            ].join('\n');
            
            const stringToSign = [
                algorithm,
                amzDate,
                credentialScope,
                CryptoJS.SHA256(canonicalRequest).toString()
            ].join('\n');
            
            const kDate = CryptoJS.HmacSHA256(dateStamp, `AWS4${secretKey}`);
            const kRegion = CryptoJS.HmacSHA256(region, kDate);
            const kService = CryptoJS.HmacSHA256(service, kRegion);
            const kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
            const signature = CryptoJS.HmacSHA256(stringToSign, kSigning).toString();
            
            queryParams.set('X-Amz-Signature', signature);
            
            const finalUrl = `${endpoint}${canonicalUri}?${queryParams.toString()}`;
            
            console.log(`✅ [Widget ${widgetInstanceId}] Signed URL generated successfully`);
            return finalUrl;
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error generating signed URL:`, error);
            console.error(`❌ [Widget ${widgetInstanceId}] Problematic key:`, key);
            throw new Error(`Failed to generate signed URL: ${error.message}`);
        }
    }, [encodeS3Key, widgetInstanceId]);

    // Enhanced media URL generation
    const generateMediaUrl = useCallback(async () => {
        if (!s3BucketName?.value || !s3FileName?.value || !awsAccessKey?.value || 
            !awsSecretKey?.value || !awsRegion?.value || !awsSessionToken?.value) {
            const missingParams = [];
            if (!s3BucketName?.value) missingParams.push('bucket');
            if (!s3FileName?.value) missingParams.push('fileName');
            if (!awsAccessKey?.value) missingParams.push('accessKey');
            if (!awsSecretKey?.value) missingParams.push('secretKey');
            if (!awsRegion?.value) missingParams.push('region');
            if (!awsSessionToken?.value) missingParams.push('sessionToken');
            
            const errorMsg = `Missing required AWS configuration: ${missingParams.join(', ')}`;
            console.error(`❌ [Widget ${widgetInstanceId}] ${errorMsg}`);
            setMediaError(errorMsg);
            setLoadingMedia(false);
            return;
        }

        const fileName = s3FileName.value;
        const isAudio = detectFileType(fileName);
        
        console.log(`🔍 [Widget ${widgetInstanceId}] Loading media for file:`, fileName, isAudio ? '(AUDIO)' : '(VIDEO)');
        setIsAudioFile(isAudio);
        setLoadingMedia(true);
        setMediaError(null);
        setMediaReady(false);
        setMediaUrl(null);
        setVideoDimensions({ width: 0, height: 0, aspectRatio: 1, renderWidth: 0, renderHeight: 0, offsetX: 0, offsetY: 0, containerLeft: 0, containerTop: 0 });

        try {
            const signedUrl = await generateSignedUrl(
                s3BucketName.value,
                fileName,
                awsRegion.value,
                awsAccessKey.value,
                awsSecretKey.value,
                awsSessionToken.value
            );
            
            // Test the URL before setting it
            const testElement = document.createElement(isAudio ? 'audio' : 'video');
            testElement.onloadedmetadata = () => {
                console.log(`✅ [Widget ${widgetInstanceId}] ${isAudio ? 'Audio' : 'Video'} metadata loaded successfully`);
                setMediaUrl(signedUrl);
                setLoadingMedia(false);
            };
            testElement.onerror = (error) => {
                console.error(`❌ [Widget ${widgetInstanceId}] ${isAudio ? 'Audio' : 'Video'} failed to load:`, error);
                setMediaError(`Failed to load ${isAudio ? 'audio' : 'video'}: Please check the file path and AWS configuration`);
                setLoadingMedia(false);
            };
            
            setTimeout(() => {
                if (testElement.readyState === 0) {
                    console.warn(`⏰ [Widget ${widgetInstanceId}] ${isAudio ? 'Audio' : 'Video'} load timeout - displaying anyway`);
                    setMediaUrl(signedUrl);
                    setLoadingMedia(false);
                }
            }, 15000);
            
            testElement.src = signedUrl;
            testElement.preload = 'metadata';
            
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error generating media URL:`, error);
            setMediaError(`Failed to generate media URL: ${error.message}`);
            setLoadingMedia(false);
        }
    }, [s3BucketName, s3FileName, awsAccessKey, awsSecretKey, awsSessionToken, awsRegion, generateSignedUrl, detectFileType, widgetInstanceId]);

    // Load media URL when credentials change
    useEffect(() => {
        if (awsAccessKey?.value && awsSecretKey?.value && awsRegion?.value && 
            s3BucketName?.value && s3FileName?.value && awsSessionToken?.value) {
            generateMediaUrl();
        }
    }, [awsAccessKey, awsSecretKey, awsRegion, awsSessionToken, s3BucketName, s3FileName, generateMediaUrl]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!showAnnotationDropdown && !showReferenceDropdown) return;
            
            const widgetContainer = containerRef.current;
            if (!widgetContainer) return;
            
            const isClickInWidget = widgetContainer.contains(event.target);
            
            if (showAnnotationDropdown) {
                const annotationDropdown = event.target.closest(`[data-widget-id="${widgetInstanceId}"] .add-dropdown-container`);
                if (!annotationDropdown && isClickInWidget) {
                    console.log(`🔽 [Widget ${widgetInstanceId}] Closing annotation dropdown - click outside`);
                    setShowAnnotationDropdown(false);
                } else if (!isClickInWidget) {
                    console.log(`🔽 [Widget ${widgetInstanceId}] Closing annotation dropdown - click outside widget`);
                    setShowAnnotationDropdown(false);
                }
            }
            
            if (showReferenceDropdown) {
                const referenceDropdown = refDocDropdownRef.current;
                if (referenceDropdown && !referenceDropdown.contains(event.target)) {
                    console.log(`🔽 [Widget ${widgetInstanceId}] Closing reference dropdown - click outside`);
                    setShowReferenceDropdown(false);
                }
            }
        };
        
        if (showAnnotationDropdown || showReferenceDropdown) {
            document.addEventListener('mousedown', handleClickOutside, true);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside, true);
            };
        }
    }, [showAnnotationDropdown, showReferenceDropdown, widgetInstanceId]);

    // Load annotations from Mendix
    useEffect(() => {
        try {
            let annotationsData = null;
            let loadedAnnotations = [];
            
            if (videoAnnotations && videoAnnotations.value !== undefined) {
                annotationsData = videoAnnotations.value;
            } else if (typeof videoAnnotations === 'string') {
                annotationsData = videoAnnotations;
            }
            
            if (annotationsData && typeof annotationsData === 'string' && annotationsData.trim() !== '' && annotationsData !== '[]') {
                try {
                    const parsed = JSON.parse(annotationsData);
                    loadedAnnotations = Array.isArray(parsed) ? parsed : [];
                    console.log(`📋 [Widget ${widgetInstanceId}] Annotations loaded:`, loadedAnnotations.length);
                } catch (parseError) {
                    console.warn(`⚠️ [Widget ${widgetInstanceId}] Failed to parse annotations JSON:`, parseError);
                    loadedAnnotations = [];
                }
            }
            
            setAnnotations(loadedAnnotations);
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error loading annotations:`, error);
            setAnnotations([]);
        }
    }, [videoAnnotations, widgetInstanceId]);

    const handleTimeUpdate = useCallback(() => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement) {
            setCurrentTime(mediaElement.currentTime);
        }
    }, [isAudioFile]);

    const handlePlayPause = useCallback(() => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement && mediaReady) {
            if (isPlaying) {
                mediaElement.pause();
                console.log(`⏸️ [Widget ${widgetInstanceId}] ${isAudioFile ? 'Audio' : 'Video'} paused at ${mediaElement.currentTime}s`);
            } else {
                mediaElement.play();
                console.log(`▶️ [Widget ${widgetInstanceId}] ${isAudioFile ? 'Audio' : 'Video'} playing from ${mediaElement.currentTime}s`);
            }
            setIsPlaying(!isPlaying);
        }
    }, [isPlaying, mediaReady, isAudioFile, widgetInstanceId]);

    const handleSeek = useCallback((time) => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement && mediaReady) {
            mediaElement.currentTime = time;
            setCurrentTime(time);
            console.log(`⏭ [Widget ${widgetInstanceId}] Seeking to ${time}s`);
        }
    }, [mediaReady, isAudioFile, widgetInstanceId]);

    const handleSkipBackward = useCallback(() => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement && mediaReady) {
            const newTime = Math.max(0, currentTime - 10);
            mediaElement.currentTime = newTime;
            setCurrentTime(newTime);
            console.log(`⏮️ [Widget ${widgetInstanceId}] Skipped backward to ${newTime}s`);
        }
    }, [mediaReady, currentTime, isAudioFile, widgetInstanceId]);

    const handleSkipForward = useCallback(() => {
        const mediaElement = isAudioFile ? audioRef.current : videoRef.current;
        if (mediaElement && mediaReady) {
            const newTime = Math.min(duration, currentTime + 10);
            mediaElement.currentTime = newTime;
            setCurrentTime(newTime);
            console.log(`⏭️ [Widget ${widgetInstanceId}] Skipped forward to ${newTime}s`);
        }
    }, [mediaReady, currentTime, duration, isAudioFile, widgetInstanceId]);

    const jumpToAnnotation = useCallback((timestamp, annotationId) => {
        console.log(`🎯 [Widget ${widgetInstanceId}] Jumping to annotation at ${timestamp}s:`, annotationId);
        handleSeek(timestamp);
        setActiveAnnotationId(annotationId);
        setTimeout(() => setActiveAnnotationId(null), 3000);
    }, [handleSeek, widgetInstanceId]);

    // FIXED: Enhanced coordinate calculation with container position compensation
    const getRelativeCoordinates = useCallback((event) => {
        if (!videoRef.current || isAudioFile) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Video ref not available or is audio file`);
            return { x: 0, y: 0 };
        }

        const video = videoRef.current;
        const containerRect = video.getBoundingClientRect();
        
        // FIXED: Get click position relative to the video element, accounting for page scroll
        const clickX = event.clientX - containerRect.left;
        const clickY = event.clientY - containerRect.top;
        
        // Use the calculated video rendering area
        const { renderWidth, renderHeight, offsetX, offsetY } = videoDimensions;
        
        if (renderWidth === 0 || renderHeight === 0) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Video rendering dimensions not available yet`);
            // FIXED: More accurate fallback calculation
            const x = Math.max(0, Math.min(100, (clickX / containerRect.width) * 100));
            const y = Math.max(0, Math.min(100, (clickY / containerRect.height) * 100));
            console.log(`🎯 [Widget ${widgetInstanceId}] Fallback coordinate calculation:`, { x, y });
            return { x, y };
        }
        
        // Check if click is within the actual video area
        if (clickX < offsetX || clickX > offsetX + renderWidth || 
            clickY < offsetY || clickY > offsetY + renderHeight) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] Click outside video area`, {
                click: { x: clickX, y: clickY },
                videoArea: { 
                    left: offsetX, 
                    top: offsetY, 
                    right: offsetX + renderWidth, 
                    bottom: offsetY + renderHeight 
                }
            });
            return null; // Return null for clicks outside video area
        }
        
        // Calculate coordinates relative to the actual video content
        const relativeX = clickX - offsetX;
        const relativeY = clickY - offsetY;
        
        // Convert to percentage of the actual video
        const x = (relativeX / renderWidth) * 100;
        const y = (relativeY / renderHeight) * 100;
        
        // Clamp to ensure within bounds
        const clampedX = Math.max(0, Math.min(100, x));
        const clampedY = Math.max(0, Math.min(100, y));
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Enhanced coordinate calculation:`, {
            containerRect: { 
                left: containerRect.left, 
                top: containerRect.top, 
                width: containerRect.width, 
                height: containerRect.height 
            },
            videoArea: { width: renderWidth, height: renderHeight, offsetX, offsetY },
            clickPosition: { x: clickX, y: clickY },
            relativeToVideo: { x: relativeX, y: relativeY },
            finalPercentages: { x: clampedX, y: clampedY }
        });
        
        return { x: clampedX, y: clampedY };
    }, [isAudioFile, videoDimensions, widgetInstanceId]);

    // ENHANCED: Media click handler with improved coordinate calculation
    const handleMediaClick = useCallback((event) => {
        if (!canAddAnnotations) {
            if (mediaReady) {
                handlePlayPause();
            }
            return;
        }
        
        // For audio files, clicking should only play/pause (no point annotations)
        if (isAudioFile) {
            if (mediaReady) {
                console.log(`🎵 [Widget ${widgetInstanceId}] Audio player clicked - toggling play/pause`);
                handlePlayPause();
            }
            return;
        }
        
        // For video files, handle point annotations
        if (annotationModeActive && mediaReady) {
            if (videoRef.current && isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
            
            const coords = getRelativeCoordinates(event);
            
            if (coords === null) {
                console.warn(`⚠️ [Widget ${widgetInstanceId}] Click outside video area - ignoring`);
                return;
            }
            
            console.log(`🎯 [Widget ${widgetInstanceId}] Point annotation placed at (${coords.x.toFixed(1)}%, ${coords.y.toFixed(1)}%) at ${currentTime}s`);
            
            setPendingAnnotation({
                x: coords.x,
                y: coords.y,
                timestamp: currentTime
            });
            setShowCommentModal(true);
            setAnnotationModeActive(false);
        } else if (!annotationModeActive && mediaReady) {
            console.log(`🎬 [Widget ${widgetInstanceId}] Video player clicked - toggling play/pause`);
            handlePlayPause();
        }
    }, [annotationModeActive, currentTime, isPlaying, handlePlayPause, mediaReady, canAddAnnotations, isAudioFile, getRelativeCoordinates, widgetInstanceId]);

    const handleAddComment = useCallback(() => {
        if (!canAddAnnotations) return;
        
        console.log(`💬 [Widget ${widgetInstanceId}] Adding comment at timestamp ${currentTime}s`);
        
        setPendingAnnotation({
            x: null,
            y: null,
            timestamp: currentTime
        });
        setShowCommentModal(true);
        setShowAnnotationDropdown(false);
    }, [currentTime, canAddAnnotations, widgetInstanceId]);

    // Only allow point comments for video files
    const handleAddPointComment = useCallback(() => {
        if (!canAddAnnotations || isAudioFile) return;
        
        console.log(`🎯 [Widget ${widgetInstanceId}] Point annotation mode activated`);
        setAnnotationModeActive(true);
        setShowAnnotationDropdown(false);
    }, [canAddAnnotations, isAudioFile, widgetInstanceId]);

    // Reference document search functions
    const handleReferenceSearchChange = useCallback((event) => {
        const value = event.target.value;
        setReferenceSearchTerm(value);
        setShowReferenceDropdown(true);
    }, []);

    const handleReferenceSearchFocus = useCallback(() => {
        setShowReferenceDropdown(true);
    }, []);

    const handleReferenceDocSelect = useCallback((doc) => {
        console.log(`📄 [Widget ${widgetInstanceId}] Reference document selected:`, doc.name);
        setSelectedReferenceDoc(String(doc.id));
        setSelectedReferenceDocName(doc.name);
        setReferenceSearchTerm(doc.name);
        setShowReferenceDropdown(false);
    }, [widgetInstanceId]);

    const clearReferenceSelection = useCallback(() => {
        console.log(`📄 [Widget ${widgetInstanceId}] Reference document selection cleared`);
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setShowReferenceDropdown(false);
    }, [widgetInstanceId]);

    // Rich text functions
    const applyRichTextFormat = useCallback((command, value = null) => {
        document.execCommand(command, false, value);
        if (richTextRef.current) {
            richTextRef.current.focus();
            setRichTextContent(richTextRef.current.innerHTML);
        }
    }, []);

    const handleRichTextInput = useCallback(() => {
        if (richTextRef.current) {
            setRichTextContent(richTextRef.current.innerHTML);
        }
    }, []);

    // File upload functions
    const uploadFileLocally = useCallback(async (file) => {
        try {
            console.log(`📎 [Widget ${widgetInstanceId}] Processing file:`, file.name);
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const base64Data = reader.result.split(',')[1];
                        const uniqueFileId = `${widgetInstanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
                        
                        const processedFile = {
                            id: uniqueFileId,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            data: base64Data,
                            storageType: 'local',
                            uploadedAt: new Date().toISOString(),
                            widgetInstanceId: widgetInstanceId
                        };
                        
                        console.log(`✅ [Widget ${widgetInstanceId}] File processed successfully:`, file.name);
                        resolve(processedFile);
                    } catch (error) {
                        console.error(`❌ [Widget ${widgetInstanceId}] Error processing file data:`, error);
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    console.error(`❌ [Widget ${widgetInstanceId}] FileReader error:`, reader.error);
                    reject(reader.error);
                };
                reader.readAsDataURL(file);
            });
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Failed to process file:`, file.name, error);
            throw new Error(`[Widget ${widgetInstanceId}] Failed to process file: ${file.name}`);
        }
    }, [widgetInstanceId]);

    const handleFileUpload = useCallback(async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const files = Array.from(event.target.files);
        console.log(`📎 [Widget ${widgetInstanceId}] File upload initiated:`, files.length, 'files');
        
        if (files.length === 0) return;
        
        const expectedInputId = `video-file-upload-input-${widgetInstanceId}`;
        if (event.target.id !== expectedInputId) {
            console.warn(`⚠️ [Widget ${widgetInstanceId}] File upload event from wrong input: ${event.target.id}, expected: ${expectedInputId}`);
            return;
        }
        
        setIsUploading(true);
        
        try {
            const uploadedFileData = [];
            
            for (const file of files) {
                try {
                    const processedFile = await uploadFileLocally(file);
                    uploadedFileData.push(processedFile);
                } catch (fileError) {
                    console.error(`❌ [Widget ${widgetInstanceId}] Failed to process ${file.name}:`, fileError);
                }
            }
            
            if (uploadedFileData.length > 0) {
                setUploadedFiles(prev => [...prev, ...uploadedFileData]);
                console.log(`✅ [Widget ${widgetInstanceId}] Successfully uploaded ${uploadedFileData.length} files`);
            }
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error processing files:`, error);
        } finally {
            setIsUploading(false);
            if (event.target) {
                event.target.value = '';
            }
        }
    }, [uploadFileLocally, widgetInstanceId]);

    const triggerFileInput = useCallback(() => {
        console.log(`📎 [Widget ${widgetInstanceId}] Triggering file input`);
        
        if (fileInputRef.current) {
            fileInputRef.current.click();
            return;
        }
        
        console.error(`❌ [Widget ${widgetInstanceId}] File input ref not available!`);
    }, [widgetInstanceId]);

    const removeFile = useCallback((fileId) => {
        console.log(`🗑️ [Widget ${widgetInstanceId}] Removing file:`, fileId);
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
    }, [widgetInstanceId]);

    // File preview functions
    const handlePreviewFile = useCallback(async (file) => {
        console.log(`👁️ [Widget ${widgetInstanceId}] Previewing file:`, file.name);
        setLoadingPreview(true);
        setPreviewFile(file);
        setShowFilePreview(true);
        
        try {
            if (file.data) {
                const binaryString = atob(file.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: file.type });
                const blobUrl = URL.createObjectURL(blob);
                
                setPreviewFile(prev => ({
                    ...prev,
                    blobUrl: blobUrl
                }));
            }
        } catch (error) {
            console.error(`❌ [Widget ${widgetInstanceId}] Error loading file for preview:`, error);
        } finally {
            setLoadingPreview(false);
        }
    }, [widgetInstanceId]);

    const handleCloseFilePreview = useCallback(() => {
        if (previewFile && previewFile.blobUrl) {
            URL.revokeObjectURL(previewFile.blobUrl);
        }
        setPreviewFile(null);
        setShowFilePreview(false);
        console.log(`👁️ [Widget ${widgetInstanceId}] File preview closed`);
    }, [previewFile, widgetInstanceId]);

    const handleDownloadUploadedFile = useCallback(() => {
        if (!previewFile) return;
        try {
          //Recreate Blob from base64
          const binaryString = atob(previewFile.data)
          const bytes = new Uint8Array(binaryString.length);
          for (let i=0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
        const blob = new Blob([bytes], { type: previewFile.type });
        const url = URL.createObjectURL(blob);
        
        // Create and trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = previewFile.name;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100)
        } catch(error) {
             console.warn("Download Failed", error)
        }
    })

    const handleReferenceDocDownload = useCallback((docId) => {
        const doc = referenceDocList.find(d => String(d.id) === String(docId));
        console.log(`📥 [Widget ${widgetInstanceId}] Downloading reference document:`, doc ? doc.name : docId);
        
        if (doc && doc.link) {
            try {
                const link = document.createElement('a');
                link.href = doc.link;
                link.download = doc.name || 'document';
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (error) {
                console.error(`❌ [Widget ${widgetInstanceId}] Error downloading document:`, error);
                window.location.href = doc.link;
            }
        }
    }, [referenceDocList, widgetInstanceId]);

    const formatFileSize = useCallback((bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // Check if form has content
    const hasContent = useCallback(() => {
        const richTextPlainText = richTextRef.current?.innerText?.trim() || '';
        const fallbackComment = comment.trim();
        return richTextPlainText.length > 0 || fallbackComment.length > 0;
    }, [comment]);

    // ENHANCED: Save annotations to Mendix with proper microflow execution (from Image Annotator)
    const saveAnnotationsToMendix = useCallback((annotationsArray) => {
        addDebugLog("=== SAVING VIDEO ANNOTATIONS TO MENDIX ===");
        addDebugLog(`Annotations to save: ${annotationsArray.length} items`);
        
        try {
            const jsonString = JSON.stringify(annotationsArray);
            addDebugLog(`JSON string to save: ${jsonString.substring(0, 100)}...`);
            
            let saveSuccess = false;
            
            // Save to attribute
            if (videoAnnotations && typeof videoAnnotations.setValue === 'function') {
                addDebugLog("📝 Attempting direct attribute update...");
                try {
                    videoAnnotations.setValue(jsonString);
                    saveSuccess = true;
                    addDebugLog("✅ Direct attribute update successful");
                } catch (error) {
                    addDebugLog(`❌ Direct attribute update failed: ${error.message}`);
                }
            } else if (videoAnnotations && videoAnnotations.value !== undefined) {
                addDebugLog("📝 Attempting direct value assignment...");
                try {
                    videoAnnotations.value = jsonString;
                    saveSuccess = true;
                    addDebugLog("✅ Direct value assignment successful");
                } catch (error) {
                    addDebugLog(`❌ Direct value assignment failed: ${error.message}`);
                }
            } else {
                addDebugLog("❌ videoAnnotations not available for direct update");
            }
            
            // ENHANCED: Execute onAnnotationAdd microflow
            if (onAnnotationAdd) {
                addDebugLog("📞 Executing onAnnotationAdd microflow...");
                const microflowSuccess = executeMendixAction(onAnnotationAdd, 'onAnnotationAdd');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationAdd microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationAdd microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationAdd not configured");
            }
            
            if (saveSuccess) {
                addDebugLog("🎉 Video annotations saved successfully to Mendix");
            } else {
                addDebugLog("⚠️ Could not save annotations - no valid save method found");
            }
            
        } catch (error) {
            addDebugLog(`❌ Error saving annotations: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] Error saving annotations:`, error);
        }
        
        addDebugLog("=== END SAVING VIDEO ANNOTATIONS ===");
    }, [onAnnotationAdd, videoAnnotations, addDebugLog, executeMendixAction, widgetInstanceId]);

    const saveAnnotations = useCallback((newAnnotations) => {
        setAnnotations(newAnnotations);
        saveAnnotationsToMendix(newAnnotations);
    }, [saveAnnotationsToMendix]);

    // ENHANCED: Handle submit like Image Annotator
    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        
        if (isSubmitting || !canAddAnnotations) return;
        
        const richTextHtml = richTextRef.current?.innerHTML || '';
        const richTextPlainText = richTextRef.current?.innerText?.trim() || '';
        const fallbackComment = comment.trim();
        
        const finalComment = richTextPlainText || fallbackComment;
        
        if (!finalComment) {
            alert('Please enter a comment before adding the annotation.');
            return;
        }

        console.log(`💾 [Widget ${widgetInstanceId}] Submitting annotation:`, { 
            type: editingAnnotation ? 'edit' : 'new', 
            comment: finalComment.substring(0, 50) + '...' 
        });
        
        setIsSubmitting(true);
        
        let updatedAnnotations;
        
        if (editingAnnotation) {
            updatedAnnotations = annotations.map(ann => 
                ann.id === editingAnnotation.id 
                    ? { 
                        ...ann, 
                        comment: finalComment,
                        richTextContent: richTextHtml,
                        referenceDoc: selectedReferenceDoc ? String(selectedReferenceDoc) : '',
                        uploadedFiles: uploadedFiles,
                        editedAt: new Date().toISOString() 
                    }
                    : ann
            );
            console.log(`✏️ [Widget ${widgetInstanceId}] Annotation edited:`, editingAnnotation.id);
        } else {
            const newAnnotation = {
                id: `${widgetInstanceId}-${Date.now()}-${Math.random()}`,
                type: 'comment',
                comment: finalComment,
                richTextContent: richTextHtml,
                referenceDoc: selectedReferenceDoc ? String(selectedReferenceDoc) : '',
                uploadedFiles: uploadedFiles,
                timestamp: pendingAnnotation?.timestamp || currentTime,
                position: pendingAnnotation && pendingAnnotation.x !== null ? {
                    x: pendingAnnotation.x,
                    y: pendingAnnotation.y
                } : null,
                color: ANNOTATION_COLOR,
                user: currentUser,
                createdAt: new Date().toISOString(),
                widgetInstanceId: widgetInstanceId,
                positioningVersion: 'v6-enhanced-container-aware' // UPDATED: Version tracking
            };
            
            updatedAnnotations = [...annotations, newAnnotation];
            console.log(`➕ [Widget ${widgetInstanceId}] New annotation created:`, newAnnotation.id);
        }
        
        saveAnnotations(updatedAnnotations);
        
        setComment('');
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setUploadedFiles([]);
        setRichTextContent('');
        setShowCommentModal(false);
        setPendingAnnotation(null);
        setEditingAnnotation(null);
        setIsSubmitting(false);
        if (richTextRef.current) {
            richTextRef.current.innerHTML = '';
        }
        
        console.log(`✅ [Widget ${widgetInstanceId}] Form reset and annotation saved`);
    }, [comment, selectedReferenceDoc, uploadedFiles, isSubmitting, pendingAnnotation, currentTime, annotations, saveAnnotations, currentUser, editingAnnotation, canAddAnnotations, richTextContent, widgetInstanceId]);

    // Handle cancel like Image Annotator
    const handleCancel = useCallback(() => {
        console.log(`❌ [Widget ${widgetInstanceId}] Form cancelled`);
        
        setComment('');
        setSelectedReferenceDoc('');
        setSelectedReferenceDocName('');
        setReferenceSearchTerm('');
        setUploadedFiles([]);
        setRichTextContent('');
        setShowCommentModal(false);
        setPendingAnnotation(null);
        setEditingAnnotation(null);
        setAnnotationModeActive(false);
        if (richTextRef.current) {
            richTextRef.current.innerHTML = '';
        }
    }, [widgetInstanceId]);

    // Handle marker click like Image Annotator
    const handleMarkerClick = useCallback((annotation, event) => {
        event.stopPropagation();
        console.log(`🎯 [Widget ${widgetInstanceId}] Annotation clicked:`, annotation.id);
        setActiveAnnotationId(annotation.id);
        jumpToAnnotation(annotation.timestamp, annotation.id);
    }, [jumpToAnnotation, widgetInstanceId]);

    // Handle annotation list click like Image Annotator
    const handleListClick = useCallback((annotation) => {
        console.log(`📋 [Widget ${widgetInstanceId}] Annotation selected from list:`, annotation.id);
        jumpToAnnotation(annotation.timestamp, annotation.id);
    }, [jumpToAnnotation, widgetInstanceId]);

    const handleEditAnnotation = useCallback((annotation, event) => {
        if (!canAddAnnotations || !canEditAnnotation(annotation)) return;
        
        event.stopPropagation();
        console.log(`✏️ [Widget ${widgetInstanceId}] Editing annotation:`, annotation.id);
        
        setEditingAnnotation(annotation);
        setComment(annotation.comment);
        
        if (annotation.referenceDoc) {
            setSelectedReferenceDoc(String(annotation.referenceDoc));
            const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
            if (refDoc) {
                setSelectedReferenceDocName(refDoc.name);
                setReferenceSearchTerm(refDoc.name);
            }
        }
        
        setUploadedFiles(annotation.uploadedFiles || []);
        setRichTextContent(annotation.richTextContent || '');
        
        setTimeout(() => {
            if (richTextRef.current) {
                richTextRef.current.innerHTML = annotation.richTextContent || annotation.comment;
            }
        }, 100);
        
        setShowCommentModal(true);
    }, [canAddAnnotations, canEditAnnotation, referenceDocList, widgetInstanceId]);

    // FIXED: Handle delete with EXACT Image Annotator implementation
    const handleDelete = useCallback((annotationId, event) => {
        if (!canAddAnnotations) return;
        
        event.stopPropagation();
        
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (!annotation || !canEditAnnotation(annotation)) {
            alert('You can only delete your own annotations.');
            return;
        }
        
        console.log(`🗑️ [Widget ${widgetInstanceId}] Deleting annotation:`, annotationId);
        
        if (window.confirm('Are you sure you want to delete this annotation?')) {
            addDebugLog("=== DELETING VIDEO ANNOTATION ===");
            addDebugLog(`Deleting annotation ID: ${annotationId}`);
            
            const updated = annotations.filter(ann => ann.id !== annotationId);
            
            // First update the UI
            setAnnotations(updated);
            
            // Save to Mendix attribute (EXACT same pattern as Image Annotator)
            try {
                const jsonString = JSON.stringify(updated);
                
                if (videoAnnotations && typeof videoAnnotations.setValue === 'function') {
                    addDebugLog("📝 Updating annotations attribute after delete...");
                    videoAnnotations.setValue(jsonString);
                    addDebugLog("✅ Annotations attribute updated successfully");
                } else if (videoAnnotations && videoAnnotations.value !== undefined) {
                    videoAnnotations.value = jsonString;
                    addDebugLog("✅ Annotations value updated directly");
                }
            } catch (error) {
                addDebugLog(`❌ Error updating annotations after delete: ${error.message}`);
            }
            
            // FIXED: Execute onAnnotationDelete microflow (EXACT same pattern as Image Annotator)
            if (onAnnotationDelete) {
                addDebugLog("📞 Executing onAnnotationDelete microflow...");
                const microflowSuccess = executeMendixAction(onAnnotationDelete, 'onAnnotationDelete');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationDelete microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationDelete microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationDelete not configured");
            }
            
            // Clean up UI state
            if (activeAnnotationId === annotationId) {
                setActiveAnnotationId(null);
            }
            
            setExpandedAnnotations(prev => {
                const newSet = new Set(prev);
                newSet.delete(annotationId);
                return newSet;
            });
            
            addDebugLog("✅ Annotation deleted successfully");
            addDebugLog("=== END DELETING VIDEO ANNOTATION ===");
            
            console.log(`✅ [Widget ${widgetInstanceId}] Annotation deleted successfully`);
        }
    }, [annotations, videoAnnotations, onAnnotationDelete, activeAnnotationId, canAddAnnotations, canEditAnnotation, addDebugLog, executeMendixAction, widgetInstanceId]);

    const formatTime = useCallback((seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    const getFormattedTime = useCallback((dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 86400) {
            if (diffInSeconds < 60) return 'Just now';
            if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
            return `${Math.floor(diffInSeconds / 3600)}h ago`;
        }
        
        return date.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }, []);

    // ENHANCED: Get sorted annotations and annotation numbers like Image Annotator
    const getSortedAnnotations = useCallback(() => {
        return [...annotations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [annotations]);

    const getAnnotationNumber = useCallback((annotationId) => {
        const sorted = getSortedAnnotations();
        const index = sorted.findIndex(ann => ann.id === annotationId);
        return index + 1;
    }, [getSortedAnnotations]);

    // FIXED: Enhanced annotation positioning with percentage-based calculation for all cases
    const getAnnotationPositionStyle = useCallback((annotation) => {
        if (!annotation.position) return {};
        
        const { renderWidth, renderHeight, offsetX, offsetY, containerWidth, containerHeight } = videoDimensions;
        
        // FIXED: Use percentage-based positioning for consistency across all widget sizes
        if (renderWidth === 0 || renderHeight === 0 || !containerWidth || !containerHeight) {
            // Fallback positioning if video dimensions not available
            return {
                position: 'absolute',
                left: `${annotation.position.x}%`,
                top: `${annotation.position.y}%`,
                transform: 'translate(-50%, -50%)'
            };
        }
        
        // FIXED: Calculate position as percentage of the video rendering area, then convert to container percentage
        const videoAreaLeftPercent = (offsetX / containerWidth) * 100;
        const videoAreaTopPercent = (offsetY / containerHeight) * 100;
        const videoAreaWidthPercent = (renderWidth / containerWidth) * 100;
        const videoAreaHeightPercent = (renderHeight / containerHeight) * 100;
        
        // Calculate final position within the container
        const finalLeftPercent = videoAreaLeftPercent + (annotation.position.x / 100) * videoAreaWidthPercent;
        const finalTopPercent = videoAreaTopPercent + (annotation.position.y / 100) * videoAreaHeightPercent;
        
        console.log(`🔍 [Widget ${widgetInstanceId}] Enhanced positioning annotation ${annotation.id}:`, {
            annotationPosition: { x: annotation.position.x, y: annotation.position.y },
            containerDimensions: { width: containerWidth, height: containerHeight },
            videoArea: { width: renderWidth, height: renderHeight, offsetX, offsetY },
            videoAreaPercents: { left: videoAreaLeftPercent, top: videoAreaTopPercent, width: videoAreaWidthPercent, height: videoAreaHeightPercent },
            finalPosition: { left: finalLeftPercent, top: finalTopPercent }
        });
        
        return {
            position: 'absolute',
            left: `${finalLeftPercent}%`,
            top: `${finalTopPercent}%`,
            transform: 'translate(-50%, -50%)'
        };
    }, [videoDimensions, widgetInstanceId]);

    const isAnnotationVisible = useCallback((annotation) => {
        return Math.abs(currentTime - annotation.timestamp) <= 0.5;
    }, [currentTime]);

    // Enhanced loading spinner render function
    const renderLoadingSpinner = () => {
        return createElement('div', {
            className: 'video-loading-container',
            style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                minHeight: '400px',
                backgroundColor: 'white',
                border: '2px dashed #dee2e6',
                borderRadius: '12px',
                color: '#6c757d',
                padding: '60px 40px',
                textAlign: 'center'
            }
        }, [
            createElement('div', {
                key: 'spinner-container',
                className: 'loading-spinner-container',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }
            }, [
                createElement('div', {
                    key: 'spinner',
                    className: 'loading-spinner',
                    style: {
                        width: '60px',
                        height: '60px',
                        border: '4px solid #e3e3e3',
                        borderTop: '4px solid #4F46E5',
                        borderRadius: '50%',
                        animation: 'videoannotator-spin 1s linear infinite',
                        marginBottom: '24px'
                    }
                }),
                createElement('p', {
                    key: 'loading-text',
                    className: 'loading-text',
                    style: {
                        margin: '0',
                        fontSize: '18px',
                        fontWeight: '500',
                        color: '#4F46E5',
                        letterSpacing: '0.5px'
                    }
                }, 'Loading media...'),
                createElement('p', {
                    key: 'loading-subtext',
                    style: {
                        margin: '8px 0 0 0',
                        fontSize: '14px',
                        color: '#9CA3AF',
                        fontStyle: 'italic'
                    }
                }, 'Please wait while we fetch your media file')
            ])
        ]);
    };

    // Enhanced reference document search (identical to Image Annotator)
    const renderReferenceDocumentSearch = () => {
        if (referenceDocList.length === 0) return null;

        return createElement('div', {
            key: 'reference-section',
            className: 'comment-form-group',
            style: {
                marginBottom: '24px'
            }
        }, [
            createElement('label', {
                key: 'reference-label',
                className: 'comment-form-label',
                style: {
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '8px'
                }
            }, 'Tag Reference Document:'),
            
            createElement('div', {
                key: 'reference-search-container',
                ref: refDocDropdownRef,
                className: 'reference-search-container',
                style: {
                    position: 'relative',
                    width: '100%'
                }
            }, [
                createElement('div', {
                    key: 'search-input-wrapper',
                    className: 'reference-search-input-wrapper',
                    style: {
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%'
                    }
                }, [
                    createElement('input', {
                        key: 'reference-search-input',
                        ref: searchInputRef,
                        type: 'text',
                        className: 'reference-search-input',
                        placeholder: 'Search and select a reference document...',
                        value: referenceSearchTerm,
                        onChange: handleReferenceSearchChange,
                        onFocus: handleReferenceSearchFocus,
                        style: {
                            width: '100%',
                            padding: '12px 16px',
                            paddingRight: '50px',
                            border: '2px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '14px',
                            outline: 'none',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s ease',
                            boxSizing: 'border-box',
                            backgroundColor: 'white',
                            color: '#374151'
                        }
                    }),
                    
                    // FIXED: Dynamic dropdown arrow with proper inline styles
                    createElement('div', {
                        key: 'dropdown-arrow',
                        className: 'reference-dropdown-arrow',
                        onClick: () => setShowReferenceDropdown(!showReferenceDropdown),
                        style: {
                            position: 'absolute',
                            right: '16px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#6b7280',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            zIndex: 2,
                            padding: '4px',
                            borderRadius: '4px',
                            userSelect: 'none'
                        }
                    }, showReferenceDropdown ? '▲' : '▼'), // FIXED: Dynamic arrow state
                    
                    // FIXED: Clear button with proper inline styles
                    selectedReferenceDoc && createElement('button', {
                        key: 'clear-button',
                        type: 'button',
                        className: 'reference-clear-button',
                        onClick: clearReferenceSelection,
                        title: 'Clear selection',
                        style: {
                            position: 'absolute',
                            right: '35px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '18px',
                            height: '18px',
                            border: 'none',
                            borderRadius: '50%',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            zIndex: 3
                        }
                    }, '×')
                ]),
                
                // FIXED: Dropdown menu with proper inline styles for portal compatibility
                showReferenceDropdown && createElement('div', {
                    key: 'reference-dropdown-menu',
                    className: 'reference-dropdown-menu',
                    style: {
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1001, // FIXED: Higher z-index for portal compatibility
                        maxHeight: '200px',
                        overflowY: 'auto',
                        marginTop: '-1px'
                    }
                }, filteredReferenceDocList().length > 0 ? 
                    filteredReferenceDocList().map(doc =>
                        createElement('div', {
                            key: doc.id,
                            className: 'reference-dropdown-item',
                            onClick: () => handleReferenceDocSelect(doc),
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 16px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                borderBottom: '1px solid #f3f4f6'
                            }
                        }, [
                            createElement('div', {
                                key: 'doc-icon',
                                className: 'reference-doc-icon',
                                style: {
                                    fontSize: '16px',
                                    flexShrink: 0
                                }
                            }, '📄'),
                            createElement('div', {
                                key: 'doc-name',
                                className: 'reference-doc-name',
                                style: {
                                    fontSize: '14px',
                                    color: '#374151',
                                    lineHeight: 1.4,
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }
                            }, doc.name)
                        ])
                    ) : 
                    createElement('div', {
                        key: 'no-results',
                        className: 'reference-no-results',
                        style: {
                            padding: '16px',
                            textAlign: 'center',
                            color: '#9ca3af',
                            fontStyle: 'italic',
                            fontSize: '14px',
                            borderBottom: '1px solid #f3f4f6'
                        }
                    }, 'No documents found')
                )
            ])
        ]);
    };

    // Modified dropdown - hide Point Comment for audio files
    const renderAnnotationDropdown = () => {
        if (!showAnnotationDropdown) return null;
        
        return createElement('div', {
            key: 'annotation-dropdown',
            className: 'annotation-dropdown-menu',
            onClick: (e) => e.stopPropagation()
        }, [
            createElement('button', {
                key: 'add-comment-option',
                className: 'dropdown-menu-item',
                onClick: (e) => {
                    e.stopPropagation();
                    handleAddComment();
                }
            }, 'Add Comment'),
            
            // Only show Point Comment for video files
            !isAudioFile && createElement('button', {
                key: 'point-comment-option',
                className: 'dropdown-menu-item',
                onClick: (e) => {
                    e.stopPropagation();
                    handleAddPointComment();
                }
            }, 'Point Comment')
        ].filter(Boolean));
    };

    // FIXED: File Preview Modal with Portal and proper z-index
    const renderFilePreviewModal = () => {
        if (!showFilePreview || !previewFile) return null;

        return createElement(AnnotationPortal, null, createElement('div', {
            key: 'file-preview-overlay',
            className: 'file-preview-overlay',
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: isMaximized ? 60000 : 20000, // FIXED: Use same z-index approach as ImageAnnotator
                backdropFilter: 'blur(4px)',
                boxSizing: 'border-box'
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCloseFilePreview();
                }
            }
        }, [
            createElement('div', {
                key: 'file-preview-modal',
                className: 'file-preview-modal',
                style: {
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    animation: 'modalSlideIn 0.3s ease-out',
                    position: 'relative'
                }
            }, [
                createElement('div', {
    key: 'file-preview-header',
    className: 'file-preview-header',
    style: {
        padding: '20px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
    }
}, [
    // Wrap title and download button together
    createElement('div', {
        key: 'title-download-group',
        style: {
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flex: 1,
            minWidth: 0,
            marginRight: '16px'
        }
    }, [
        createElement('h3', {
            key: 'file-preview-title',
            className: 'file-preview-title',
            style: {
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1f2937',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }
        }, previewFile.name),
        
        createElement('button', {
            key: 'custom-download-button',
            onClick: handleDownloadUploadedFile,
            style: {
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                whiteSpace: 'nowrap',
                flexShrink: 0
            }
        }, '⬇ Download')
    ]),
    
    // Close button on the right
    createElement('button', {
        key: 'close-preview',
        className: 'file-preview-close',
        onClick: handleCloseFilePreview,
        style: {
            width: '32px',
            height: '32px',
            border: 'none',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            color: '#6b7280',
            transition: 'all 0.2s ease',
            flexShrink: 0
        }
    }, '×')
]),
                
                createElement('div', {
                    key: 'file-preview-content',
                    className: 'file-preview-content',
                    style: {
                        flex: 1,
                        padding: '24px',
                        overflow: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }
                }, [
                    loadingPreview ? 
                        createElement('div', {
                            key: 'loading-preview',
                            className: 'file-preview-loading',
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '40px',
                                color: '#6b7280'
                            }
                        }, [
                            createElement('div', {
                                key: 'spinner',
                                className: 'loading-spinner',
                                style: {
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid #e3e3e3',
                                    borderTop: '3px solid #3b82f6',
                                    borderRadius: '50%',
                                    animation: 'videoannotator-spin 1s linear infinite',
                                    marginBottom: '16px'
                                }
                            }),
                            createElement('p', {
                                key: 'loading-text'
                            }, 'Loading file...')
                        ]) :
                        previewFile.blobUrl ? 
                            (previewFile.type.startsWith('image/') ? 
                                createElement('img', {
                                    key: 'image-preview',
                                    src: previewFile.blobUrl,
                                    alt: previewFile.name,
                                    className: 'file-preview-image',
                                    style: {
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                    }
                                }) :
                                previewFile.type === 'application/pdf' ?
                                    createElement('iframe', {
                                        key: 'pdf-preview',
                                        src: previewFile.blobUrl,
                                        className: 'file-preview-pdf',
                                        title: previewFile.name,
                                        style: {
                                            width: '100%',
                                            height: '600px',
                                            border: 'none',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                        }
                                    }) :
                                    createElement('div', {
                                        key: 'download-preview',
                                        className: 'file-preview-download',
                                        style: {
                                            textAlign: 'center',
                                            padding: '40px'
                                        }
                                    }, [
                                        createElement('div', {
                                            key: 'file-icon',
                                            className: 'file-preview-icon',
                                            style: {
                                                fontSize: '64px',
                                                marginBottom: '16px'
                                            }
                                        }, '📄'),
                                        createElement('p', {
                                            key: 'file-info',
                                            style: {
                                                margin: '0 0 20px 0',
                                                fontSize: '16px',
                                                color: '#6b7280'
                                            }
                                        }, `${previewFile.name} (${formatFileSize(previewFile.size)})`),
                                        createElement('a', {
                                            key: 'download-link',
                                            href: previewFile.blobUrl,
                                            download: previewFile.name,
                                            className: 'file-preview-download-btn',
                                            style: {
                                                display: 'inline-block',
                                                padding: '12px 24px',
                                                backgroundColor: '#3b82f6',
                                                color: 'white',
                                                textDecoration: 'none',
                                                borderRadius: '8px',
                                                fontWeight: '500',
                                                transition: 'all 0.2s ease'
                                            }
                                        }, 'Download File')
                                    ])
                            ) : null
                ])
            ])
        ]));
    };

    // FIXED: Form modal with Portal and proper z-index
    const renderFormModal = () => {
        if (!showCommentModal) return null;

        return createElement(AnnotationPortal, null, createElement('div', {
            key: 'form-overlay',
            className: 'annotation-form-overlay',
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: isMaximized ? 60000 : 10000, // FIXED: Use same z-index approach as ImageAnnotator
                backdropFilter: 'blur(4px)',
                padding: '20px',
                boxSizing: 'border-box'
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCancel();
                }
            }
        }, [
            createElement('div', {
                key: 'form-modal',
                className: 'annotation-form-modal',
                style: {
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    width: '90%',
                    maxWidth: '600px',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    animation: 'modalSlideIn 0.3s ease-out',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                }
            }, [
                // Header
                createElement('div', {
                    key: 'form-header',
                    className: 'annotation-form-header',
                    style: {
                        backgroundColor: '#f8fafc',
                        color: '#1e293b',
                        padding: '20px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #e2e8f0',
                        flexShrink: 0
                    }
                }, [
                    createElement('h2', {
                        key: 'form-title',
                        className: 'annotation-form-title',
                        style: {
                            margin: '0',
                            fontSize: '20px',
                            fontWeight: '600',
                            color: '#1e293b'
                        }
                    }, editingAnnotation ? 'Edit Annotation' : 'New Annotation'),
                    createElement('button', {
                        key: 'close-btn',
                        className: 'annotation-form-close',
                        onClick: handleCancel,
                        style: {
                            width: '32px',
                            height: '32px',
                            border: 'none',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            color: '#64748b',
                            transition: 'all 0.2s ease'
                        }
                    }, '×')
                ]),
                
                // Body
                createElement('div', {
                    key: 'form-body',
                    className: 'annotation-form-body',
                    style: {
                        padding: '24px',
                        flex: 1,
                        overflowY: 'auto'
                    }
                }, [
                    // Rich text editor section
                    createElement('div', {
                        key: 'richtext-section',
                        className: 'form-section',
                        style: {
                            marginBottom: '24px'
                        }
                    }, [
                        createElement('div', {
                            key: 'richtext-toolbar',
                            className: 'richtext-toolbar',
                            style: {
                                display: 'flex',
                                gap: '4px',
                                marginBottom: '8px',
                                padding: '8px',
                                backgroundColor: '#f8f9fa',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                borderBottomLeftRadius: '0',
                                borderBottomRightRadius: '0'
                            }
                        }, [
                            createElement('button', {
                                key: 'bold-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('bold'),
                                title: 'Bold',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'B'),
                            createElement('button', {
                                key: 'italic-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('italic'),
                                title: 'Italic',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'I'),
                            createElement('button', {
                                key: 'underline-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('underline'),
                                title: 'Underline',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, 'U'),
                            createElement('button', {
                                key: 'list-btn',
                                className: 'richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('insertUnorderedList'),
                                title: 'Bullet List',
                                style: {
                                    padding: '6px 10px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s ease',
                                    color: '#374151'
                                }
                            }, '•')
                        ]),
                        
                        createElement('div', {
                            key: 'richtext-editor',
                            ref: richTextRef,
                            className: 'richtext-editor',
                            contentEditable: true,
                            'data-placeholder': 'Enter your comment with formatting...',
                            onInput: handleRichTextInput,
                            style: {
                                minHeight: '120px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                padding: '16px',
                                border: '1px solid #e5e7eb',
                                borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                                backgroundColor: 'white',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.2s ease',
                                boxSizing: 'border-box',
                                width: '100%',
                                color: '#374151',
                                display: 'block',
                                position: 'relative'
                            }
                        })
                    ]),
                    
                    // File upload section
                    createElement('div', {
                        key: 'file-section',
                        className: 'form-section',
                        style: {
                            marginBottom: '24px'
                        }
                    }, [
                        createElement('label', {
                            key: 'file-label',
                            className: 'form-section-label',
                            style: {
                                display: 'block',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151',
                                marginBottom: '8px'
                            }
                        }, 'Attach Files:'),
                        
                        createElement('div', {
                            key: 'file-upload-area',
                            className: 'file-upload-area',
                            style: {
                                marginBottom: '16px'
                            }
                        }, [
                            createElement('input', {
                                key: `file-input-${widgetInstanceId}`,
                                ref: fileInputRef,
                                type: 'file',
                                id: `video-file-upload-input-${widgetInstanceId}`,
                                className: 'file-input',
                                'data-widget-id': widgetInstanceId,
                                multiple: true,
                                accept: '*/*',
                                onChange: handleFileUpload,
                                style: { display: 'none' },
                                onClick: (e) => {
                                    e.stopPropagation();
                                    console.log(`📎 [Widget ${widgetInstanceId}] File input clicked directly`);
                                }
                            }),
                            
                            createElement('button', {
                                key: 'file-upload-trigger',
                                type: 'button',
                                onClick: (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    console.log(`📎 [Widget ${widgetInstanceId}] Upload button clicked`);
                                    triggerFileInput();
                                },
                                className: 'file-upload-btn',
                                disabled: isUploading,
                                'data-widget-id': widgetInstanceId,
                                style: { 
                                    cursor: isUploading ? 'not-allowed' : 'pointer',
                                    opacity: isUploading ? 0.6 : 1,
                                    display: 'inline-block',
                                    padding: '10px 16px',
                                    border: '2px dashed #d1d5db',
                                    borderRadius: '8px',
                                    backgroundColor: '#f9fafb',
                                    fontSize: '14px',
                                    color: '#6b7280',
                                    textAlign: 'center',
                                    fontWeight: '500'
                                }
                            }, isUploading ? 'Processing...' : 'Choose Files')
                        ]),
                        
                        // Uploaded files display
                        uploadedFiles.length > 0 && createElement('div', {
                            key: 'uploaded-files',
                            className: 'uploaded-files-list',
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '12px'
                            }
                        }, uploadedFiles.map(file => 
                            createElement('div', {
                                key: file.id,
                                className: 'uploaded-file-item',
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    backgroundColor: '#f3f4f6',
                                    borderRadius: '6px',
                                    border: '1px solid #e5e7eb'
                                }
                            }, [
                                createElement('span', {
                                    key: 'file-icon',
                                    className: 'file-icon',
                                    style: {
                                        fontSize: '14px',
                                        marginRight: '8px'
                                    }
                                }, '📄'),
                                createElement('span', {
                                    key: 'file-name',
                                    className: 'file-name',
                                    style: {
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        color: '#1f2937',
                                        marginRight: '8px',
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }
                                }, file.name),
                                createElement('span', {
                                    key: 'file-size',
                                    className: 'file-size',
                                    style: {
                                        fontSize: '12px',
                                        color: '#6b7280',
                                        marginRight: '8px'
                                    }
                                }, formatFileSize(file.size)),
                                createElement('button', {
                                    key: 'remove-btn',
                                    className: 'file-remove-btn',
                                    onClick: () => removeFile(file.id),
                                    title: 'Remove file',
                                    style: {
                                        width: '24px',
                                        height: '24px',
                                        border: 'none',
                                        borderRadius: '4px',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }
                                }, '×')
                            ])
                        ))
                    ]),
                    
                    // Reference document section
                    renderReferenceDocumentSearch(),
                    
                    // Show current user
                    createElement('div', {
                        key: 'user-display',
                        className: 'user-display',
                        style: {
                            fontSize: '12px',
                            color: '#6b7280',
                            fontStyle: 'italic',
                            marginTop: '16px',
                            padding: '8px 12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                        }
                    }, `Creating annotation as: ${currentUser}`)
                ]),
                
                // Footer
                createElement('div', {
                    key: 'form-footer',
                    className: 'annotation-form-footer',
                    style: {
                        padding: '16px 24px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        borderTop: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        flexShrink: 0
                    }
                }, [
                    createElement('button', {
                        key: 'cancel-btn',
                        className: 'btn btn-cancel',
                        onClick: handleCancel,
                        style: {
                            padding: '10px 20px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            border: 'none',
                            transition: 'all 0.2s ease',
                            fontFamily: 'inherit',
                            backgroundColor: '#6b7280',
                            color: 'white'
                        }
                    }, 'Cancel'),
                    createElement('button', {
                        key: 'save-btn',
                        className: 'btn btn-save',
                        onClick: handleSubmit,
                        disabled: !hasContent() || isSubmitting,
                        style: {
                            padding: '10px 20px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: !hasContent() || isSubmitting ? 'not-allowed' : 'pointer',
                            border: 'none',
                            transition: 'all 0.2s ease',
                            fontFamily: 'inherit',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            opacity: !hasContent() || isSubmitting ? 0.6 : 1
                        }
                    }, isSubmitting ? 'Saving...' : 'Save')
                ])
            ])
        ]));
    };

    // Handle different loading/error states
    if (mediaError) {
        return createElement('div', {
            className: `mx-videoannotator mx-videoannotator-error ${className} ${isMaximized ? 'video-maximized' : ''}`.trim(),
            style: { 
                fontFamily: 'system-ui, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                backgroundColor: 'white',
                ...style 
            },
            'data-mendix-id': name,
            'data-custom-class': className,
            'data-widget-id': widgetInstanceId,
            ref: containerRef
        }, [
            createElement('div', {
                key: 'error-content',
                className: 'error-content'
            }, [
                createElement('div', {
                    key: 'icon',
                    className: 'error-icon'
                }, '⚠️'),
                createElement('p', {
                    key: 'message',
                    className: 'error-message'
                }, mediaError),
                createElement('button', {
                    key: 'retry',
                    className: 'retry-button',
                    onClick: generateMediaUrl
                }, 'Retry')
            ])
        ]);
    }

    // Show spinner while loading
    if (loadingMedia || !mediaUrl) {
        return createElement('div', {
            className: `mx-videoannotator ${isAudioFile ? 'audio-mode' : 'video-mode'} ${className} ${isMaximized ? 'video-maximized' : ''}`.trim(),
            style: { 
                fontFamily: 'system-ui, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                backgroundColor: 'white',
                ...style 
            },
            tabIndex,
            'data-mendix-id': name,
            'data-custom-class': className,
            'data-widget-id': widgetInstanceId,
            ref: containerRef
        }, [
            createElement('div', {
                key: 'main-content',
                className: 'main-content'
            }, [
                createElement('div', {
                    key: 'media-area',
                    className: 'video-area'
                }, [
                    // MODIFIED: Header moved to video area only with white background
                    createElement('div', {
                        key: 'video-header-bar',
                        className: 'video-header-bar'
                    }, [
                        createElement('div', {
                            key: 'header-left',
                            className: 'header-left'
                        }, [
                            createElement('button', {
                                key: 'maximize-btn',
                                onClick: handleMaximizeToggle,
                                className: `video-button video-maximize-minimize-btn ${isMaximized ? 'video-minimize-btn' : 'video-maximize-btn'}`,
                                title: isMaximized ? 'Minimize (Press Esc)' : 'Maximize'
                            }, isMaximized ? 'Minimize' : 'Maximize')
                        ]),
                        
                        createElement('div', {
                            key: 'header-right',
                            className: 'header-right'
                        }, [
                            canAddAnnotations ? createElement('div', {
                                key: 'add-dropdown-container',
                                className: 'add-dropdown-container'
                            }, [
                                createElement('button', {
                                    key: 'add-annotations-btn',
                                    className: 'add-annotations-btn',
                                    disabled: true,
                                    style: { opacity: 0.5 }
                                }, [
                                    createElement('span', { key: 'plus' }, '+'),
                                    createElement('span', { key: 'text' }, 'Add Annotations'),
                                    createElement('span', { key: 'chevron' }, '▼')
                                ])
                            ]) : null
                        ].filter(Boolean))
                    ]),
                    
                    createElement('div', {
                        key: 'video-container',
                        className: 'video-container'
                    }, [
                        createElement('div', {
                            key: 'video-wrapper',
                            className: 'video-wrapper'
                        }, [
                            renderLoadingSpinner()
                        ])
                    ])
                ]),
                
                createElement('div', {
                    key: 'annotations-sidebar',
                    className: 'annotations-sidebar'
                }, [
                    createElement('div', {
                        key: 'sidebar-header',
                        className: 'sidebar-header'
                    }, [
                        createElement('h3', {
                            key: 'sidebar-title',
                            className: 'sidebar-title'
                        }, 'Annotations'),
                        createElement('div', {
                            key: 'annotation-count',
                            className: 'annotation-count-badge'
                        }, '0')
                    ]),
                    
                    createElement('div', {
                        key: 'annotations-list',
                        className: 'annotations-list'
                    }, [
                        createElement('div', {
                            className: 'no-annotations'
                        }, 'Loading media...')
                    ])
                ])
            ])
        ]);
    }

    // Main render when media is ready
    return createElement('div', {
        className: `mx-videoannotator ${isAudioFile ? 'audio-mode' : 'video-mode'} ${className} ${isMaximized ? 'video-maximized' : ''}`.trim(),
        style: { 
            fontFamily: 'system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: 'white',
            ...style 
        },
        tabIndex,
        'data-mendix-id': name,
        'data-custom-class': className,
        'data-widget-id': widgetInstanceId,
        ref: containerRef
    }, [
        // Main content
        createElement('div', {
            key: 'main-content',
            className: 'main-content'
        }, [
            // Media area
            createElement('div', {
                key: 'media-area',
                className: 'video-area'
            }, [
                // MODIFIED: Header moved to video area only with white background
                createElement('div', {
                    key: 'video-header-bar',
                    className: 'video-header-bar'
                }, [
                    createElement('div', {
                        key: 'header-left',
                        className: 'header-left'
                    }, [
                        createElement('button', {
                            key: 'maximize-btn',
                            onClick: handleMaximizeToggle,
                            className: `video-button video-maximize-minimize-btn ${isMaximized ? 'video-minimize-btn' : 'video-maximize-btn'}`,
                            title: isMaximized ? 'Minimize (Press Esc)' : 'Maximize'
                        }, isMaximized ? 'Minimize' : 'Maximize')
                    ]),
                    
                    createElement('div', {
                        key: 'header-right',
                        className: 'header-right'
                    }, [
                        canAddAnnotations ? createElement('div', {
                            key: 'add-dropdown-container',
                            className: 'add-dropdown-container'
                        }, [
                            createElement('button', {
                                key: 'add-annotations-btn',
                                className: `add-annotations-btn ${annotationModeActive ? 'annotation-mode' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    if (annotationModeActive) {
                                        console.log(`❌ [Widget ${widgetInstanceId}] Annotation mode cancelled`);
                                        setAnnotationModeActive(false);
                                    } else {
                                        console.log(`🎯 [Widget ${widgetInstanceId}] Annotation dropdown toggled`);
                                        setShowAnnotationDropdown(!showAnnotationDropdown);
                                    }
                                }
                            }, [
                                createElement('span', { key: 'plus' }, annotationModeActive ? '×' : '+'),
                                createElement('span', { key: 'text' }, 
                                    annotationModeActive ? 'Cancel Annotation' : 'Add Annotations'),
                                !annotationModeActive && createElement('span', { key: 'chevron' }, '▼')
                            ].filter(Boolean)),
                            renderAnnotationDropdown()
                        ]) : null
                    ].filter(Boolean))
                ]),
                
                // Enhanced video container
                createElement('div', {
                    key: 'media-container',
                    ref: videoContainerRef,
                    className: 'video-container'
                }, [
                    createElement('div', {
                        key: 'media-wrapper',
                        className: 'video-wrapper'
                    }, [
                        // Render video or audio element based on file type
                        isAudioFile ? 
                            // Audio element with waveform visualization placeholder
                            createElement('div', {
                                key: 'audio-player-container',
                                className: 'audio-player-container',
                                onClick: handleMediaClick
                            }, [
                                createElement('audio', {
                                    key: 'main-audio',
                                    ref: audioRef,
                                    src: mediaUrl,
                                    onLoadedMetadata: handleLoadedMetadata,
                                    onTimeUpdate: handleTimeUpdate,
                                    onError: (e) => {
                                        console.error(`❌ [Widget ${widgetInstanceId}] Audio element error:`, e);
                                        setMediaError('Failed to load audio file - please check the file format and path');
                                        setLoadingMedia(false);
                                    },
                                    onCanPlay: () => {
                                        console.log(`✅ [Widget ${widgetInstanceId}] Audio is ready to play`);
                                    },
                                    controls: false,
                                    preload: "metadata"
                                }),
                                // Audio visualization placeholder
                                createElement('div', {
                                    key: 'audio-visualization',
                                    className: 'audio-visualization'
                                }, [
                                    createElement('div', {
                                        key: 'audio-icon',
                                        className: 'audio-icon'
                                    }, '🎵'),
                                    createElement('div', {
                                        key: 'audio-info',
                                        className: 'audio-info'
                                    }, [
                                        createElement('h3', {
                                            key: 'audio-title',
                                            className: 'audio-title'
                                        }, 'Audio File'),
                                        createElement('p', {
                                            key: 'audio-description',
                                            className: 'audio-description'
                                        }, 'Click to play/pause • Add timestamp annotations using the controls below')
                                    ]),
                                    // Show current playing status
                                    isPlaying && createElement('div', {
                                        key: 'playing-indicator',
                                        className: 'playing-indicator'
                                    }, 'Playing... ♪')
                                ])
                            ]) :
                            // ENHANCED: Video element with proper aspect ratio handling and object-fit: contain
                            createElement('div', {
                                key: 'video-container-inner',
                                className: 'video-container-inner'
                            }, [
                                createElement('video', {
                                    key: 'main-video',
                                    ref: videoRef,
                                    src: mediaUrl,
                                    className: annotationModeActive ? 'main-video annotation-mode' : 'main-video',
                                    onLoadedMetadata: handleLoadedMetadata,
                                    onTimeUpdate: handleTimeUpdate,
                                    onClick: handleMediaClick,
                                    onError: (e) => {
                                        console.error(`❌ [Widget ${widgetInstanceId}] Video element error:`, e);
                                        setMediaError('Failed to load video file - please check the file format and path');
                                        setLoadingMedia(false);
                                    },
                                    onCanPlay: () => {
                                        console.log(`✅ [Widget ${widgetInstanceId}] Video is ready to play`);
                                    },
                                    controls: false,
                                    preload: "metadata",
                                    playsInline: true,
                                    style: {
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain', // CHANGED: Using contain instead of cover for accurate positioning
                                        objectPosition: 'center',
                                        display: 'block',
                                        cursor: annotationModeActive ? 'crosshair' : 'pointer'
                                    }
                                }),
                        
                                // ENHANCED: Video overlays with numbered markers and accurate positioning
                                createElement('div', {
                                    key: 'video-overlays',
                                    ref: videoOverlaysRef,
                                    className: 'video-overlays'
                                }, [
                                    // ENHANCED: Point annotations as numbered markers (ONLY SHOW WHEN VISIBLE)
                                    ...getSortedAnnotations()
                                        .filter(annotation => annotation.position && isAnnotationVisible(annotation))
                                        .map((annotation) => {
                                            const isActive = activeAnnotationId === annotation.id;
                                            
                                            return createElement('div', {
                                                key: `marker-${annotation.id}`,
                                                className: `annotation-marker visible${isActive ? ' active' : ''}`,
                                                style: {
                                                    ...getAnnotationPositionStyle(annotation),
                                                    backgroundColor: ANNOTATION_COLOR,
                                                    zIndex: 15
                                                },
                                                onClick: (e) => handleMarkerClick(annotation, e),
                                                title: annotation.comment
                                            }, getAnnotationNumber(annotation.id).toString());
                                        }),
                                    
                                    // NEW: Timestamp-only comments shown in top right when visible
                                    ...getSortedAnnotations()
                                        .filter(annotation => !annotation.position && isAnnotationVisible(annotation))
                                        .map((annotation) => {
                                            const isActive = activeAnnotationId === annotation.id;
                                            
                                            return createElement('div', {
                                                key: `timestamp-comment-${annotation.id}`,
                                                className: `video-timestamp-comment${isActive ? ' active' : ''}`,
                                                onClick: (e) => {
                                                    e.stopPropagation();
                                                    handleMarkerClick(annotation, e);
                                                },
                                                title: 'Click to select annotation'
                                            }, [
                                                createElement('div', {
                                                    key: 'comment-badge',
                                                    className: 'comment-badge'
                                                }, getAnnotationNumber(annotation.id).toString()),
                                                createElement('div', {
                                                    key: 'comment-content',
                                                    className: 'comment-content'
                                                }, [
                                                    createElement('div', {
                                                        key: 'comment-text',
                                                        className: 'comment-text'
                                                    }, annotation.comment.length > 60 ? 
                                                        annotation.comment.substring(0, 60) + '...' : 
                                                        annotation.comment),
                                                    createElement('div', {
                                                        key: 'comment-time',
                                                        className: 'comment-time'
                                                    }, formatTime(annotation.timestamp))
                                                ])
                                            ]);
                                        }),
                                    
                                    // Mode indicator
                                    annotationModeActive && createElement('div', {
                                        key: 'annotation-mode-indicator',
                                        className: 'mode-indicator',
                                        style: {
                                            position: 'absolute',
                                            bottom: '-40px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            color: 'white',
                                            padding: '8px 16px',
                                            borderRadius: '20px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            whiteSpace: 'nowrap',
                                            zIndex: 20
                                        }
                                    }, 'Click to place annotation')
                                ])
                            ])
                    ])
                ]),
                
                // Bottom controls
                mediaReady && createElement('div', {
                    key: 'bottom-controls',
                    className: 'bottom-controls'
                }, [
                    createElement('div', {
                        key: 'timeline-container',
                        className: 'timeline-container'
                    }, [
                        createElement('input', {
                            key: 'timeline',
                            className: 'timeline-slider',
                            type: 'range',
                            min: '0',
                            max: duration || 0,
                            value: currentTime,
                            onChange: (e) => handleSeek(parseFloat(e.target.value))
                        }),
                        ...annotations.map((annotation) => 
                            createElement('div', {
                                key: `timeline-marker-${annotation.id}`,
                                className: 'timeline-marker',
                                style: {
                                    left: `${(annotation.timestamp / duration) * 100}%`
                                },
                                onClick: () => jumpToAnnotation(annotation.timestamp, annotation.id)
                            })
                        )
                    ]),
                    
                    createElement('div', {
                        key: 'control-buttons',
                        className: 'control-buttons'
                    }, [
                        createElement('div', {
                            key: 'playback-controls',
                            className: 'playback-controls'
                        }, [
                            createElement('button', {
                                key: 'prev-btn',
                                className: 'control-btn',
                                onClick: handleSkipBackward,
                                disabled: !mediaReady,
                                title: 'Skip back 10 seconds'
                            }, '⏮'),
                            createElement('button', {
                                key: 'play-pause',
                                className: 'play-pause-btn',
                                onClick: handlePlayPause,
                                disabled: !mediaReady
                            }, isPlaying ? 'II' : '▶'),
                            createElement('button', {
                                key: 'next-btn',
                                className: 'control-btn',
                                onClick: handleSkipForward,
                                disabled: !mediaReady,
                                title: 'Skip forward 10 seconds'
                            }, '⏭'),
                            createElement('span', {
                                key: 'time-display',
                                className: 'time-display'
                            }, `${formatTime(currentTime)} / ${formatTime(duration)}`)
                        ])
                    ])
                ])
            ]),
            
            // Enhanced sidebar with read more/less functionality
            createElement('div', {
                key: 'annotations-sidebar',
                className: 'annotations-sidebar'
            }, [
                createElement('div', {
                    key: 'sidebar-header',
                    className: 'sidebar-header'
                }, [
                    createElement('h3', {
                        key: 'sidebar-title',
                        className: 'sidebar-title'
                    }, 'Annotations'),
                    createElement('div', {
                        key: 'annotation-count',
                        className: 'annotation-count-badge'
                    }, annotations.length.toString())
                ]),
                
                createElement('div', {
                    key: 'annotations-list',
                    className: 'annotations-list'
                }, annotations.length > 0 ? 
                    getSortedAnnotations().map((annotation, index) => {
                        const isCurrentAnnotation = Math.abs(currentTime - annotation.timestamp) <= 0.5;
                        const isSelected = activeAnnotationId === annotation.id;
                        const isExpanded = expandedAnnotations.has(annotation.id);
                        const annotationNumber = getAnnotationNumber(annotation.id);
                        
                        return createElement('div', {
                            key: annotation.id,
                            className: `annotation-item${isSelected ? ' selected' : ''}${isCurrentAnnotation ? ' current' : ''}`,
                            onClick: () => handleListClick(annotation)
                        }, [
                            createElement('div', {
                                key: 'annotation-header',
                                className: 'annotation-item-header'
                            }, [
                                createElement('div', {
                                    key: 'title-section',
                                    className: 'title-section'
                                }, [
                                    createElement('span', {
                                        key: 'annotation-number',
                                        className: 'annotation-number'
                                    }, annotationNumber),
                                    createElement('span', {
                                        key: 'annotation-type',
                                        className: 'annotation-type'
                                    }, annotation.position ? '📍' : '▶'),
                                    createElement('span', {
                                        key: 'timestamp',
                                        className: 'timestamp'
                                    }, formatTime(annotation.timestamp)),
                                    isCurrentAnnotation && createElement('span', {
                                        key: 'current-badge',
                                        className: 'current-badge'
                                    }, 'CURRENT')
                                ]),
                                
                                (canAddAnnotations && canEditAnnotation(annotation)) ? createElement('div', {
                                    key: 'action-buttons',
                                    className: 'action-buttons'
                                }, [
                                    createElement('button', {
                                        key: 'edit-btn',
                                        className: 'action-btn edit-btn',
                                        onClick: (e) => handleEditAnnotation(annotation, e),
                                        title: 'Edit annotation'
                                    }, '✏'),
                                    createElement('button', {
                                        key: 'delete-btn',
                                        className: 'action-btn delete-btn',
                                        onClick: (e) => handleDelete(annotation.id, e),
                                        title: 'Delete annotation'
                                    }, '🗑')
                                ]) : null
                            ]),
                            
                            createElement('div', {
                                key: 'annotation-content',
                                className: 'annotation-content'
                            }, [
                                annotation.richTextContent ? 
                                    createElement('div', {
                                        key: 'rich-text',
                                        className: 'annotation-rich-content',
                                        dangerouslySetInnerHTML: { 
                                            __html: isExpanded ? 
                                                annotation.richTextContent : 
                                                getTruncatedText(annotation)
                                        }
                                    }) : 
                                    createElement('p', {
                                        key: 'plain-text',
                                        className: 'annotation-text'
                                    }, isExpanded ? 
                                        annotation.comment : 
                                        getTruncatedText(annotation)),
                                
                                createElement('button', {
                                    key: 'read-more-btn',
                                    className: 'read-more-btn',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        toggleAnnotationExpansion(annotation.id);
                                    }
                                }, isExpanded ? 'Read Less' : 'Read More'),
                                
                                isExpanded && [
                                    annotation.uploadedFiles && annotation.uploadedFiles.length > 0 && 
                                    createElement('div', {
                                        key: 'files',
                                        className: 'annotation-files'
                                    }, [
                                        createElement('div', {
                                            key: 'files-title',
                                            className: 'annotation-files-title'
                                        }, 'Files:'),
                                        ...annotation.uploadedFiles.map(file => 
                                            createElement('div', {
                                                key: file.id,
                                                className: 'annotation-file-item clickable-file',
                                                onClick: (e) => {
                                                    e.stopPropagation();
                                                    handlePreviewFile(file);
                                                },
                                                title: 'Click to preview file'
                                            }, `📄 ${file.name}`)
                                        )
                                    ]),
                                
                                    annotation.referenceDoc && createElement('div', {
                                        key: 'reference-doc',
                                        className: 'annotation-reference-doc'
                                    }, [
                                        createElement('div', {
                                            key: 'ref-title',
                                            className: 'annotation-files-title'
                                        }, 'Reference Document:'),
                                        createElement('div', {
                                            key: 'ref-content',
                                            className: 'clickable-file reference-doc-item',
                                            onClick: (e) => {
                                                e.stopPropagation();
                                                handleReferenceDocDownload(annotation.referenceDoc);
                                            },
                                            title: 'Click to download reference document'
                                        }, (() => {
                                            const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
                                            return refDoc ? `📄 ${refDoc.name}` : `📄 Document ID: ${annotation.referenceDoc}`;
                                        })())
                                    ])
                                ]
                            ]),
                            
                            createElement('div', {
                                key: 'annotation-footer',
                                className: 'annotation-footer'
                            }, [
                                createElement('span', {
                                    key: 'author',
                                    className: 'author',
                                    style: {
                                        color: canEditAnnotation(annotation) ? '#10B981' : '#6B7280',
                                        fontWeight: canEditAnnotation(annotation) ? '600' : '400'
                                    }
                                }, `${annotation.user}${canEditAnnotation(annotation) ? ' (You)' : ''}`),
                                createElement('span', {
                                    key: 'date',
                                    className: 'date'
                                }, getFormattedTime(annotation.createdAt))
                            ])
                        ]);
                    }) :
                    createElement('div', {
                        className: 'no-annotations'
                    }, 'No annotations yet')
                )
            ])
        ]),
        
        renderFormModal(),
        renderFilePreviewModal()
    ]);
}