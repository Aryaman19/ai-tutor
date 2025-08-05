"""
Audio merging utilities using pydub for server-side audio processing.
"""
import os
import tempfile
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import logging

from pydub import AudioSegment
from pydub.exceptions import CouldntDecodeError

logger = logging.getLogger(__name__)

class AudioMerger:
    """
    Server-side audio merger using pydub for efficient audio processing
    """
    
    def __init__(self, crossfade_duration_ms: int = 1500, output_format: str = "wav", pause_duration_ms: int = 500):
        """
        Initialize AudioMerger
        
        Args:
            crossfade_duration_ms: Crossfade duration in milliseconds (default: 1500ms)
            output_format: Output audio format ('wav' or 'mp3')
            pause_duration_ms: Silence duration between segments in milliseconds (default: 500ms)
        """
        self.crossfade_duration_ms = crossfade_duration_ms
        self.pause_duration_ms = pause_duration_ms
        self.output_format = output_format.lower()
        
        if self.output_format not in ['wav', 'mp3']:
            raise ValueError("Output format must be 'wav' or 'mp3'")
    
    def normalize_audio_format(self, audio: AudioSegment, 
                              target_sample_rate: int = 44100, 
                              target_channels: int = 2, 
                              target_sample_width: int = 2) -> AudioSegment:
        """
        Normalize audio segment to consistent format to prevent static noise
        
        Args:
            audio: Input AudioSegment
            target_sample_rate: Target sample rate in Hz (default: 44100)
            target_channels: Target number of channels (default: 2 for stereo)
            target_sample_width: Target sample width in bytes (default: 2 for 16-bit)
        
        Returns:
            Normalized AudioSegment
        """
        normalized = audio
        
        # Set sample rate
        if normalized.frame_rate != target_sample_rate:
            normalized = normalized.set_frame_rate(target_sample_rate)
            logger.debug(f"Normalized sample rate from {audio.frame_rate} to {target_sample_rate}")
        
        # Set channels
        if normalized.channels != target_channels:
            if target_channels == 2 and normalized.channels == 1:
                # Convert mono to stereo
                normalized = AudioSegment.from_mono_audiosegments(normalized, normalized)
            elif target_channels == 1 and normalized.channels == 2:
                # Convert stereo to mono
                normalized = normalized.set_channels(1)
            else:
                normalized = normalized.set_channels(target_channels)
            logger.debug(f"Normalized channels from {audio.channels} to {target_channels}")
        
        # Set sample width (bit depth)
        if normalized.sample_width != target_sample_width:
            normalized = normalized.set_sample_width(target_sample_width)
            logger.debug(f"Normalized sample width from {audio.sample_width} to {target_sample_width}")
        
        return normalized
    
    def merge_audio_files_with_silence(
        self, 
        audio_file_paths: List[str], 
        output_path: str,
        segment_info: Optional[List[Dict[str, Any]]] = None,
        fade_duration_ms: int = 50
    ) -> Tuple[str, float, List[Dict[str, Any]]]:
        """
        Merge multiple audio files with silence padding between segments to eliminate static noise
        
        Args:
            audio_file_paths: List of paths to audio files to merge
            output_path: Path where merged audio will be saved
            segment_info: Optional list of segment metadata (slide numbers, text, etc.)
            fade_duration_ms: Duration of fade in/out at segment boundaries (default: 50ms)
        
        Returns:
            Tuple of (output_path, total_duration_seconds, updated_segment_info)
        
        Raises:
            FileNotFoundError: If any input audio file doesn't exist
            CouldntDecodeError: If any audio file can't be decoded
            Exception: For other audio processing errors
        """
        if not audio_file_paths:
            raise ValueError("No audio files provided for merging")
        
        logger.info(f"Merging {len(audio_file_paths)} audio files with {self.pause_duration_ms}ms silence padding")
        
        # Validate all input files exist
        for audio_path in audio_file_paths:
            if not os.path.exists(audio_path):
                raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        try:
            # Load and normalize first audio segment
            first_audio = AudioSegment.from_file(audio_file_paths[0])
            merged_audio = self.normalize_audio_format(first_audio)
            updated_segments = []
            current_time_ms = 0
            
            # Process first segment info
            if segment_info and len(segment_info) > 0:
                first_segment = segment_info[0].copy()
                segment_duration_ms = len(merged_audio)
                
                first_segment.update({
                    "start_time": current_time_ms / 1000.0,
                    "duration": segment_duration_ms / 1000.0,
                    "end_time": (current_time_ms + segment_duration_ms) / 1000.0
                })
                updated_segments.append(first_segment)
                current_time_ms += segment_duration_ms
            
            # Merge remaining audio files with silence padding
            for i, audio_path in enumerate(audio_file_paths[1:], 1):
                try:
                    # Load and normalize next audio
                    next_audio_raw = AudioSegment.from_file(audio_path)
                    next_audio = self.normalize_audio_format(next_audio_raw)
                    
                    # Apply fade-out to previous audio segment
                    merged_audio = merged_audio.fade_out(fade_duration_ms)
                    
                    # Create silence with matching characteristics
                    silence = AudioSegment.silent(
                        duration=self.pause_duration_ms,
                        frame_rate=merged_audio.frame_rate
                    ).set_channels(merged_audio.channels).set_sample_width(merged_audio.sample_width)
                    
                    # Apply fade-in to next audio segment
                    next_audio_faded = next_audio.fade_in(fade_duration_ms)
                    
                    # Concatenate: previous_audio + silence + next_audio
                    merged_audio = merged_audio + silence + next_audio_faded
                    
                    # Add silence duration to current time
                    current_time_ms += self.pause_duration_ms
                    
                    # Update segment timing info
                    if segment_info and i < len(segment_info):
                        segment = segment_info[i].copy()
                        segment_duration_ms = len(next_audio)
                        
                        segment.update({
                            "start_time": current_time_ms / 1000.0,
                            "duration": segment_duration_ms / 1000.0,
                            "end_time": (current_time_ms + segment_duration_ms) / 1000.0
                        })
                        updated_segments.append(segment)
                        current_time_ms += segment_duration_ms
                    
                    logger.debug(f"Merged audio file {i+1}/{len(audio_file_paths)} with silence padding: {audio_path}")
                
                except CouldntDecodeError as e:
                    logger.error(f"Failed to decode audio file {audio_path}: {e}")
                    raise CouldntDecodeError(f"Could not decode audio file {audio_path}: {e}")
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # Export merged audio
            if self.output_format == "mp3":
                merged_audio.export(output_path, format="mp3", bitrate="128k")
            else:
                merged_audio.export(output_path, format="wav")
            
            total_duration_seconds = len(merged_audio) / 1000.0
            
            logger.info(f"Successfully merged audio with silence padding to {output_path} (duration: {total_duration_seconds:.2f}s)")
            
            return output_path, total_duration_seconds, updated_segments
        
        except Exception as e:
            logger.error(f"Audio merging with silence failed: {e}")
            raise Exception(f"Failed to merge audio files with silence: {e}")
    
    def merge_audio_files(
        self, 
        audio_file_paths: List[str], 
        output_path: str,
        segment_info: Optional[List[Dict[str, Any]]] = None,
        use_silence_padding: bool = False
    ) -> Tuple[str, float, List[Dict[str, Any]]]:
        """
        Merge multiple audio files with either crossfade transitions or silence padding
        
        Args:
            audio_file_paths: List of paths to audio files to merge
            output_path: Path where merged audio will be saved
            segment_info: Optional list of segment metadata (slide numbers, text, etc.)
            use_silence_padding: If True, use silence padding instead of crossfade (default: False)
        
        Returns:
            Tuple of (output_path, total_duration_seconds, updated_segment_info)
        
        Raises:
            FileNotFoundError: If any input audio file doesn't exist
            CouldntDecodeError: If any audio file can't be decoded
            Exception: For other audio processing errors
        """
        # Use silence padding method if requested
        if use_silence_padding:
            return self.merge_audio_files_with_silence(audio_file_paths, output_path, segment_info)
        
        # Original crossfade implementation
        if not audio_file_paths:
            raise ValueError("No audio files provided for merging")
        
        logger.info(f"Merging {len(audio_file_paths)} audio files with {self.crossfade_duration_ms}ms crossfade")
        
        # Validate all input files exist
        for audio_path in audio_file_paths:
            if not os.path.exists(audio_path):
                raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        try:
            # Load first audio segment
            merged_audio = AudioSegment.from_file(audio_file_paths[0])
            updated_segments = []
            current_time_ms = 0
            
            # Process first segment info
            if segment_info and len(segment_info) > 0:
                first_segment = segment_info[0].copy()
                segment_duration_ms = len(merged_audio)
                
                # Apply crossfade adjustment to first segment
                if len(audio_file_paths) > 1:
                    segment_duration_ms -= self.crossfade_duration_ms
                
                first_segment.update({
                    "start_time": current_time_ms / 1000.0,
                    "duration": segment_duration_ms / 1000.0,
                    "end_time": (current_time_ms + segment_duration_ms) / 1000.0
                })
                updated_segments.append(first_segment)
                current_time_ms += segment_duration_ms
            
            # Merge remaining audio files with crossfade
            for i, audio_path in enumerate(audio_file_paths[1:], 1):
                try:
                    next_audio = AudioSegment.from_file(audio_path)
                    
                    # Apply crossfade
                    merged_audio = merged_audio.append(next_audio, crossfade=self.crossfade_duration_ms)
                    
                    # Update segment timing info
                    if segment_info and i < len(segment_info):
                        segment = segment_info[i].copy()
                        segment_duration_ms = len(next_audio)
                        
                        # Apply crossfade adjustment to all but last segment
                        if i < len(audio_file_paths) - 1:
                            segment_duration_ms -= self.crossfade_duration_ms
                        
                        segment.update({
                            "start_time": current_time_ms / 1000.0,
                            "duration": segment_duration_ms / 1000.0,
                            "end_time": (current_time_ms + segment_duration_ms) / 1000.0
                        })
                        updated_segments.append(segment)
                        current_time_ms += segment_duration_ms
                    
                    logger.debug(f"Merged audio file {i+1}/{len(audio_file_paths)}: {audio_path}")
                
                except CouldntDecodeError as e:
                    logger.error(f"Failed to decode audio file {audio_path}: {e}")
                    raise CouldntDecodeError(f"Could not decode audio file {audio_path}: {e}")
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # Export merged audio
            if self.output_format == "mp3":
                merged_audio.export(output_path, format="mp3", bitrate="128k")
            else:
                merged_audio.export(output_path, format="wav")
            
            total_duration_seconds = len(merged_audio) / 1000.0
            
            logger.info(f"Successfully merged audio to {output_path} (duration: {total_duration_seconds:.2f}s)")
            
            return output_path, total_duration_seconds, updated_segments
        
        except Exception as e:
            logger.error(f"Audio merging failed: {e}")
            raise Exception(f"Failed to merge audio files: {e}")
    
    def merge_audio_segments_with_metadata(
        self,
        audio_segments: List[Dict[str, Any]],
        output_path: str
    ) -> Tuple[str, float, List[Dict[str, Any]]]:
        """
        Merge audio segments with their metadata
        
        Args:
            audio_segments: List of audio segment dictionaries with 'audio_url' or file path
            output_path: Path where merged audio will be saved
        
        Returns:
            Tuple of (output_path, total_duration_seconds, updated_segments)
        """
        # Extract file paths from segments
        audio_paths = []
        valid_segments = []
        
        for segment in audio_segments:
            # Skip segments without audio
            if not segment.get("audio_id") or not segment.get("audio_url"):
                logger.warning(f"Skipping segment {segment.get('slide_number', 'unknown')} - no audio available")
                continue
            
            # For now, assume we have local file paths
            # This would need to be adapted based on your file storage system
            audio_path = segment.get("audio_path")  # You'd need to add this field
            if not audio_path:
                logger.warning(f"Skipping segment {segment.get('slide_number', 'unknown')} - no file path available")
                continue
            
            audio_paths.append(audio_path)
            valid_segments.append(segment)
        
        if not audio_paths:
            raise ValueError("No valid audio segments found for merging")
        
        return self.merge_audio_files(audio_paths, output_path, valid_segments)
    
    def cleanup_individual_files(self, file_paths: List[str]) -> None:
        """
        Clean up individual audio files after successful merging
        
        Args:
            file_paths: List of file paths to delete
        """
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.debug(f"Deleted individual audio file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")
    
    @staticmethod
    def get_audio_duration(file_path: str) -> Optional[float]:
        """
        Get duration of an audio file in seconds
        
        Args:
            file_path: Path to audio file
        
        Returns:
            Duration in seconds, or None if file can't be read
        """
        try:
            audio = AudioSegment.from_file(file_path)
            return len(audio) / 1000.0
        except Exception as e:
            logger.error(f"Failed to get duration for {file_path}: {e}")
            return None