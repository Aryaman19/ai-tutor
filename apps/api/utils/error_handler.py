"""
Centralized error handling utilities for the AI Tutor API.
"""
import logging
from typing import Any, Optional
from fastapi import HTTPException
from bson import ObjectId

logger = logging.getLogger(__name__)


class ErrorHandler:
    """Centralized error handling for API operations."""
    
    @staticmethod
    def handle_service_error(operation: str, error: Exception, status_code: int = 500) -> HTTPException:
        """
        Handle service errors with proper logging and consistent error responses.
        
        Args:
            operation: Description of the operation that failed
            error: The exception that occurred
            status_code: HTTP status code to return
            
        Returns:
            HTTPException with appropriate status and message
        """
        logger.error(f"Error in {operation}: {error}", exc_info=True)
        return HTTPException(
            status_code=status_code,
            detail=f"Failed to {operation}"
        )
    
    @staticmethod
    def validate_object_id(obj_id: str, resource_name: str = "resource") -> ObjectId:
        """
        Validate and convert string to ObjectId.
        
        Args:
            obj_id: String representation of ObjectId
            resource_name: Name of the resource for error messages
            
        Returns:
            Valid ObjectId
            
        Raises:
            HTTPException: If ObjectId is invalid
        """
        if not ObjectId.is_valid(obj_id):
            logger.warning(f"Invalid {resource_name} ID provided: {obj_id}")
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid {resource_name} ID"
            )
        return ObjectId(obj_id)
    
    @staticmethod
    def handle_not_found(resource_name: str, resource_id: str) -> HTTPException:
        """
        Handle resource not found errors.
        
        Args:
            resource_name: Name of the resource
            resource_id: ID of the resource
            
        Returns:
            HTTPException with 404 status
        """
        logger.warning(f"{resource_name} not found: {resource_id}")
        return HTTPException(
            status_code=404, 
            detail=f"{resource_name} not found"
        )
    
    @staticmethod
    def handle_service_unavailable(service_name: str, details: Optional[str] = None) -> HTTPException:
        """
        Handle service unavailability errors.
        
        Args:
            service_name: Name of the unavailable service
            details: Additional details about the error
            
        Returns:
            HTTPException with 503 status
        """
        message = f"{service_name} service is unavailable"
        if details:
            message += f": {details}"
        
        logger.error(f"Service unavailable: {message}")
        return HTTPException(
            status_code=503,
            detail=message
        )
    
    @staticmethod
    def handle_validation_error(field_name: str, error_detail: str) -> HTTPException:
        """
        Handle validation errors.
        
        Args:
            field_name: Name of the field that failed validation
            error_detail: Details about the validation failure
            
        Returns:
            HTTPException with 400 status
        """
        logger.warning(f"Validation error for {field_name}: {error_detail}")
        return HTTPException(
            status_code=400,
            detail=f"Validation error: {error_detail}"
        )


class AuthenticationError(Exception):
    """Custom exception for authentication failures."""
    pass


class ServiceUnavailableError(Exception):
    """Custom exception for service unavailability."""
    pass