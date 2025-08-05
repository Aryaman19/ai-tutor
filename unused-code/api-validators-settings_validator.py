from typing import List, Dict, Any, Optional, Union
from pydantic import ValidationError
from models.settings import (
    UserSettings, UserProfile, LLMSettings, TTSSettings, STTSettings, 
    LanguageSettings, AppearanceSettings, LessonSettings, NotificationSettings
)


class ValidationResult:
    """Result of validation with errors and warnings"""
    
    def __init__(self):
        self.is_valid = True
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.field_errors: Dict[str, List[str]] = {}
    
    def add_error(self, field: str, message: str):
        """Add a validation error"""
        self.is_valid = False
        self.errors.append(f"{field}: {message}")
        if field not in self.field_errors:
            self.field_errors[field] = []
        self.field_errors[field].append(message)
    
    def add_warning(self, field: str, message: str):
        """Add a validation warning"""
        self.warnings.append(f"{field}: {message}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "field_errors": self.field_errors
        }


class SettingsValidator:
    """Validator for user settings with comprehensive validation rules"""
    
    @staticmethod
    def validate_user_settings(settings_data: Dict[str, Any]) -> ValidationResult:
        """Validate complete user settings"""
        result = ValidationResult()
        
        # Validate each section
        if "profile" in settings_data:
            SettingsValidator._validate_profile(settings_data["profile"], result)
        
        if "llm" in settings_data:
            SettingsValidator._validate_llm(settings_data["llm"], result)
        
        if "tts" in settings_data:
            SettingsValidator._validate_tts(settings_data["tts"], result)
        
        if "stt" in settings_data:
            SettingsValidator._validate_stt(settings_data["stt"], result)
        
        if "language" in settings_data:
            SettingsValidator._validate_language(settings_data["language"], result)
        
        if "appearance" in settings_data:
            SettingsValidator._validate_appearance(settings_data["appearance"], result)
        
        if "lessons" in settings_data:
            SettingsValidator._validate_lessons(settings_data["lessons"], result)
        
        if "notifications" in settings_data:
            SettingsValidator._validate_notifications(settings_data["notifications"], result)
        
        return result
    
    @staticmethod
    def _validate_profile(profile_data: Dict[str, Any], result: ValidationResult):
        """Validate user profile settings"""
        if "name" in profile_data:
            name = profile_data["name"]
            if not name or len(name.strip()) < 2:
                result.add_error("profile.name", "Name must be at least 2 characters long")
            elif len(name) > 100:
                result.add_error("profile.name", "Name must be less than 100 characters")
        
        if "email" in profile_data:
            email = profile_data["email"]
            if email and "@" not in email:
                result.add_error("profile.email", "Invalid email format")
    
    @staticmethod
    def _validate_llm(llm_data: Dict[str, Any], result: ValidationResult):
        """Validate LLM settings"""
        if "timing" in llm_data:
            timing = llm_data["timing"]
            valid_timings = ["short", "medium", "long"]
            if timing not in valid_timings:
                result.add_error("llm.timing", f"Timing must be one of: {', '.join(valid_timings)}")
        
        if "difficulty" in llm_data:
            difficulty = llm_data["difficulty"]
            valid_difficulties = ["easy", "intermediate", "advanced"]
            if difficulty not in valid_difficulties:
                result.add_error("llm.difficulty", f"Difficulty must be one of: {', '.join(valid_difficulties)}")
        
        if "model" in llm_data:
            model = llm_data["model"]
            if not model:
                result.add_error("llm.model", "Model selection is required")
            elif not isinstance(model, str):
                result.add_error("llm.model", "Model must be a string")
        
        if "provider" in llm_data:
            provider = llm_data["provider"]
            valid_providers = ["ollama", "openai", "anthropic", "cohere"]
            if provider not in valid_providers:
                result.add_error("llm.provider", f"Provider must be one of: {', '.join(valid_providers)}")
    
    @staticmethod
    def _validate_tts(tts_data: Dict[str, Any], result: ValidationResult):
        """Validate TTS settings"""
        if "speed" in tts_data:
            speed = tts_data["speed"]
            if not isinstance(speed, (int, float)):
                result.add_error("tts.speed", "Speed must be a number")
            elif speed < 0.25 or speed > 4:
                result.add_error("tts.speed", "Speed must be between 0.25 and 4")
        
        if "volume" in tts_data:
            volume = tts_data["volume"]
            if not isinstance(volume, (int, float)):
                result.add_error("tts.volume", "Volume must be a number")
            elif volume < 0 or volume > 1:
                result.add_error("tts.volume", "Volume must be between 0 and 1")
        
        if "provider" in tts_data:
            provider = tts_data["provider"]
            valid_providers = ["browser", "elevenlabs", "openai", "azure"]
            if provider not in valid_providers:
                result.add_error("tts.provider", f"Provider must be one of: {', '.join(valid_providers)}")
        
        if "apiKey" in tts_data:
            api_key = tts_data["apiKey"]
            provider = tts_data.get("provider", "browser")
            if provider != "browser" and not api_key:
                result.add_warning("tts.apiKey", f"API key is required for {provider} provider")
    
    @staticmethod
    def _validate_stt(stt_data: Dict[str, Any], result: ValidationResult):
        """Validate STT settings"""
        if "provider" in stt_data:
            provider = stt_data["provider"]
            valid_providers = ["browser", "whisper", "deepgram", "azure"]
            if provider not in valid_providers:
                result.add_error("stt.provider", f"Provider must be one of: {', '.join(valid_providers)}")
        
        if "language" in stt_data:
            language = stt_data["language"]
            if not isinstance(language, str):
                result.add_error("stt.language", "Language must be a string")
            elif len(language) < 2:
                result.add_error("stt.language", "Language code must be at least 2 characters")
        
        if "apiKey" in stt_data:
            api_key = stt_data["apiKey"]
            provider = stt_data.get("provider", "browser")
            if provider != "browser" and not api_key:
                result.add_warning("stt.apiKey", f"API key is required for {provider} provider")
    
    @staticmethod
    def _validate_language(language_data: Dict[str, Any], result: ValidationResult):
        """Validate language settings"""
        if "primary" in language_data:
            primary = language_data["primary"]
            if not isinstance(primary, str):
                result.add_error("language.primary", "Primary language must be a string")
        
        if "secondary" in language_data:
            secondary = language_data["secondary"]
            if secondary and not isinstance(secondary, str):
                result.add_error("language.secondary", "Secondary language must be a string")
    
    @staticmethod
    def _validate_appearance(appearance_data: Dict[str, Any], result: ValidationResult):
        """Validate appearance settings"""
        if "theme" in appearance_data:
            theme = appearance_data["theme"]
            valid_themes = ["light", "dark", "system"]
            if theme not in valid_themes:
                result.add_error("appearance.theme", f"Theme must be one of: {', '.join(valid_themes)}")
        
        if "colorScheme" in appearance_data:
            color_scheme = appearance_data["colorScheme"]
            valid_schemes = ["blue", "green", "purple", "orange", "red"]
            if color_scheme not in valid_schemes:
                result.add_error("appearance.colorScheme", f"Color scheme must be one of: {', '.join(valid_schemes)}")
    
    @staticmethod
    def _validate_lessons(lessons_data: Dict[str, Any], result: ValidationResult):
        """Validate lesson settings"""
        if "difficulty" in lessons_data:
            difficulty = lessons_data["difficulty"]
            valid_difficulties = ["beginner", "intermediate", "advanced"]
            if difficulty not in valid_difficulties:
                result.add_error("lessons.difficulty", f"Difficulty must be one of: {', '.join(valid_difficulties)}")
        
        if "duration" in lessons_data:
            duration = lessons_data["duration"]
            if not isinstance(duration, int):
                result.add_error("lessons.duration", "Duration must be an integer")
            elif duration < 5 or duration > 120:
                result.add_error("lessons.duration", "Duration must be between 5 and 120 minutes")
    
    @staticmethod
    def _validate_notifications(notifications_data: Dict[str, Any], result: ValidationResult):
        """Validate notification settings"""
        boolean_fields = ["email", "push", "desktop", "sound"]
        for field in boolean_fields:
            if field in notifications_data:
                value = notifications_data[field]
                if not isinstance(value, bool):
                    result.add_error(f"notifications.{field}", f"{field} must be a boolean")
    
    @staticmethod
    def validate_section(section_name: str, section_data: Dict[str, Any]) -> ValidationResult:
        """Validate a specific settings section"""
        result = ValidationResult()
        
        validators = {
            "profile": SettingsValidator._validate_profile,
            "llm": SettingsValidator._validate_llm,
            "tts": SettingsValidator._validate_tts,
            "stt": SettingsValidator._validate_stt,
            "language": SettingsValidator._validate_language,
            "appearance": SettingsValidator._validate_appearance,
            "lessons": SettingsValidator._validate_lessons,
            "notifications": SettingsValidator._validate_notifications,
        }
        
        if section_name not in validators:
            result.add_error("section", f"Unknown section: {section_name}")
            return result
        
        validators[section_name](section_data, result)
        return result
    
    @staticmethod
    def sanitize_settings(settings_data: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize settings data by removing invalid fields and normalizing values"""
        sanitized = {}
        
        # Define valid fields for each section
        valid_fields = {
            "profile": ["name", "email", "avatar", "timezone"],
            "llm": ["provider", "model", "timing", "difficulty", "apiKey"],
            "tts": ["provider", "voice", "speed", "volume", "apiKey"],
            "stt": ["provider", "language", "continuous", "interimResults", "apiKey"],
            "language": ["primary", "secondary"],
            "appearance": ["theme", "colorScheme", "fontSize"],
            "lessons": ["difficulty", "duration", "autoAdvance"],
            "notifications": ["email", "push", "desktop", "sound"]
        }
        
        for section, fields in valid_fields.items():
            if section in settings_data:
                sanitized[section] = {}
                for field in fields:
                    if field in settings_data[section]:
                        sanitized[section][field] = settings_data[section][field]
        
        return sanitized