# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Mendix pluggable widget for video annotation. It allows users to annotate S3-hosted videos with comments, positioned markers, and time-range selections. The widget is built with React and follows Mendix widget development patterns.

## Commands

### Development
- `npm start` - Start development server and watch for changes
- `npm run dev` - Start web development server
- `npm run build` - Build the widget for production
- `npm run lint` - Run linting checks
- `npm run lint:fix` - Fix linting issues automatically
- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run release` - Release the widget

### Package Management
- Use `npm install --legacy-peer-deps` if using npm v7.x.x

## Architecture

### Core Components
- **Videoannotator.jsx**: Main widget component handling video playback, annotation modes, and state management
- **Components directory**: Contains modular React components (though main functionality is in the root component)
- **Videoannotator.xml**: Mendix widget configuration defining properties and metadata
- **Videoannotator.editorConfig.js**: Editor configuration for Mendix Studio Pro

### Key Features
- **Video Playback**: HTML5 video player with custom controls
- **Annotation Modes**: 
  - Point annotations (click to place markers on video)
  - Time-range annotations (select start/end times)
  - Comment annotations (text-only at current time)
- **Timeline Integration**: Visual timeline showing annotation markers
- **Annotation Persistence**: Saves annotations as JSON to Mendix attribute

### State Management
The widget uses React hooks for state management:
- Video playback state (playing, currentTime, duration, volume)
- Annotation state (annotations array, modes, pending annotations)
- UI state (modals, selection mode, video readiness)

### Mendix Integration
- **Properties**: `surl` (S3 video URL), `pdfAnnotations` (JSON string for annotations)
- **Callback**: `onAnnotationAdd` - called when annotations are updated
- **Platform**: Web only, requires entity context

### Data Flow
1. Video URL comes from `surl` Mendix attribute
2. Existing annotations loaded from `pdfAnnotations` JSON string
3. New annotations created via UI interactions
4. Annotations saved back to Mendix via `onAnnotationAdd` callback
5. Global `jumpToVideoTime` function exposed for external navigation

## Development Notes

### Styling
- Uses inline styles with React createElement API
- CSS file at `src/ui/Videoannotator.css`
- Responsive design with flexbox layout

### Dependencies
- `classnames` for conditional CSS classes
- `prop-types` for prop validation
- Uses Mendix pluggable widgets tools for build process

### Testing
- Uses Mendix pluggable widgets testing framework
- Test project configuration in package.json config section