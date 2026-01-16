"""
Client for the nanobana floor plan generation API.

This is a placeholder implementation - replace with actual API integration.
"""

import os
import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass
class GenerationResult:
    """Result from a floor plan generation request."""
    success: bool
    image_data: Optional[bytes] = None
    image_url: Optional[str] = None
    metadata: Dict[str, Any] = None
    error: Optional[str] = None
    raw_response: Optional[str] = None


class NanobanaClient:
    """
    Client for interacting with the nanobana API.
    
    Note: This is a template implementation. You'll need to:
    1. Set the correct API endpoint
    2. Configure authentication
    3. Adjust request/response handling for the actual API
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 120.0
    ):
        """
        Initialize the client.
        
        Args:
            api_key: API key for authentication (or set NANOBANA_API_KEY env var)
            base_url: Base URL for the API (or set NANOBANA_API_URL env var)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key or os.getenv("NANOBANA_API_KEY")
        self.base_url = base_url or os.getenv("NANOBANA_API_URL", "https://api.nanobana.ai")
        self.timeout = timeout
        
        self._client = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Lazy initialization of HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers=self._get_headers()
            )
        return self._client
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers including authentication."""
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
    
    async def generate_floor_plan(
        self,
        prompt: str,
        **kwargs
    ) -> GenerationResult:
        """
        Generate a floor plan from a prompt.
        
        Args:
            prompt: The generation prompt
            **kwargs: Additional API parameters
            
        Returns:
            GenerationResult with image data and metadata
        """
        try:
            # Construct request payload
            # Adjust this based on actual nanobana API spec
            payload = {
                "prompt": prompt,
                "model": kwargs.get("model", "floor-plan-v1"),
                "output_format": kwargs.get("output_format", "png"),
                "width": kwargs.get("width", 1024),
                "height": kwargs.get("height", 1024),
                **kwargs
            }
            
            response = await self.client.post(
                "/v1/generate",
                json=payload
            )
            
            response.raise_for_status()
            
            data = response.json()
            
            # Extract image - adjust based on actual response format
            image_data = None
            image_url = data.get("image_url")
            
            if image_url:
                # Download the image
                img_response = await self.client.get(image_url)
                img_response.raise_for_status()
                image_data = img_response.content
            elif "image_base64" in data:
                import base64
                image_data = base64.b64decode(data["image_base64"])
            
            return GenerationResult(
                success=True,
                image_data=image_data,
                image_url=image_url,
                metadata=data.get("metadata", {}),
                raw_response=data.get("text_response")
            )
            
        except httpx.HTTPStatusError as e:
            return GenerationResult(
                success=False,
                error=f"API error: {e.response.status_code} - {e.response.text}"
            )
        except Exception as e:
            return GenerationResult(
                success=False,
                error=str(e)
            )
    
    async def generate_batch(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[GenerationResult]:
        """
        Generate multiple floor plans concurrently.
        
        Args:
            prompts: List of generation prompts
            **kwargs: Additional API parameters
            
        Returns:
            List of GenerationResults
        """
        tasks = [
            self.generate_floor_plan(prompt, **kwargs)
            for prompt in prompts
        ]
        return await asyncio.gather(*tasks)
    
    async def generate_variations(
        self,
        base_image: bytes,
        count: int = 5,
        variation_strength: float = 0.5,
        **kwargs
    ) -> List[GenerationResult]:
        """
        Generate variations of an existing floor plan.
        
        Args:
            base_image: The source floor plan image
            count: Number of variations to generate
            variation_strength: How different variations should be (0-1)
            **kwargs: Additional API parameters
            
        Returns:
            List of GenerationResults
        """
        try:
            import base64
            
            # Encode image
            image_b64 = base64.b64encode(base_image).decode()
            
            payload = {
                "image": image_b64,
                "num_variations": count,
                "strength": variation_strength,
                **kwargs
            }
            
            response = await self.client.post(
                "/v1/variations",
                json=payload
            )
            
            response.raise_for_status()
            data = response.json()
            
            results = []
            for item in data.get("variations", []):
                image_data = None
                if "image_base64" in item:
                    image_data = base64.b64decode(item["image_base64"])
                
                results.append(GenerationResult(
                    success=True,
                    image_data=image_data,
                    image_url=item.get("image_url"),
                    metadata=item.get("metadata", {})
                ))
            
            return results
            
        except Exception as e:
            return [GenerationResult(success=False, error=str(e))]
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


# Synchronous wrapper for non-async contexts
class NanobanaClientSync:
    """Synchronous wrapper for NanobanaClient."""
    
    def __init__(self, **kwargs):
        self._async_client = NanobanaClient(**kwargs)
    
    def generate_floor_plan(self, prompt: str, **kwargs) -> GenerationResult:
        """Generate a floor plan synchronously."""
        return asyncio.run(
            self._async_client.generate_floor_plan(prompt, **kwargs)
        )
    
    def generate_batch(self, prompts: List[str], **kwargs) -> List[GenerationResult]:
        """Generate multiple floor plans synchronously."""
        return asyncio.run(
            self._async_client.generate_batch(prompts, **kwargs)
        )






