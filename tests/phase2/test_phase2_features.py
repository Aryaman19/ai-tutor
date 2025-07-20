#!/usr/bin/env python3
"""
Phase 2 Features Testing Script

This script tests the newly implemented Phase 2 chunked generation features
against the running backend on port 8000.
"""

import asyncio
import httpx
import json
import time
from typing import Dict, Any, List

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

class Phase2Tester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=120.0)
        self.results = []
    
    async def test_health_check(self) -> Dict[str, Any]:
        """Test if the backend is running and healthy"""
        print("🔍 Testing backend health...")
        
        try:
            response = await self.client.get(f"{API_BASE}/health")
            result = {
                "test": "health_check",
                "status": "success" if response.status_code == 200 else "failed",
                "response_code": response.status_code,
                "data": response.json() if response.status_code == 200 else None
            }
        except Exception as e:
            result = {
                "test": "health_check", 
                "status": "error",
                "error": str(e)
            }
        
        self.results.append(result)
        print(f"   ✅ Health check: {result['status']}")
        return result
    
    async def test_llm_health(self) -> Dict[str, Any]:
        """Test LLM service health"""
        print("🔍 Testing LLM service health...")
        
        try:
            response = await self.client.get(f"{API_BASE}/llm/health")
            result = {
                "test": "llm_health",
                "status": "success" if response.status_code == 200 else "failed",
                "response_code": response.status_code,
                "data": response.json() if response.status_code == 200 else None
            }
        except Exception as e:
            result = {
                "test": "llm_health",
                "status": "error", 
                "error": str(e)
            }
        
        self.results.append(result)
        print(f"   ✅ LLM health: {result['status']}")
        return result
    
    async def test_topic_analysis(self) -> Dict[str, Any]:
        """Test topic complexity analysis endpoint"""
        print("🔍 Testing topic analysis...")
        
        test_request = {
            "topic": "Photosynthesis in plants",
            "difficulty_level": "beginner",
            "content_type": "process",
            "target_duration": 90.0,
            "user_id": "test_user"
        }
        
        try:
            start_time = time.time()
            response = await self.client.post(
                f"{API_BASE}/lesson/analyze-chunking",
                json=test_request
            )
            duration = time.time() - start_time
            
            result = {
                "test": "topic_analysis",
                "status": "success" if response.status_code == 200 else "failed",
                "response_code": response.status_code,
                "duration": duration,
                "request": test_request,
                "data": response.json() if response.status_code == 200 else None
            }
            
            if response.status_code != 200:
                result["error"] = response.text
            
        except Exception as e:
            result = {
                "test": "topic_analysis",
                "status": "error",
                "error": str(e),
                "request": test_request
            }
        
        self.results.append(result)
        print(f"   ✅ Topic analysis: {result['status']} ({result.get('duration', 0):.2f}s)")
        
        if result.get("data") and result["status"] == "success":
            recommendation = result["data"].get("recommendation")
            if recommendation:
                print(f"      📊 Recommended: {recommendation.get('chunk_size')} chunks")
                print(f"      📊 Estimated chunks: {recommendation.get('estimated_chunks_needed')}")
                print(f"      📊 Confidence: {recommendation.get('confidence', 0):.2f}")
        
        return result
    
    async def test_chunked_generation(self) -> Dict[str, Any]:
        """Test chunked content generation"""
        print("🔍 Testing chunked generation...")
        
        test_request = {
            "topic": "How plants make food through photosynthesis",
            "difficulty_level": "beginner", 
            "content_type": "process",
            "target_duration": 60.0,
            "user_id": "test_user"
        }
        
        try:
            start_time = time.time()
            response = await self.client.post(
                f"{API_BASE}/lesson/chunked",
                json=test_request
            )
            duration = time.time() - start_time
            
            result = {
                "test": "chunked_generation",
                "status": "success" if response.status_code == 200 else "failed",
                "response_code": response.status_code,
                "duration": duration,
                "request": test_request,
                "data": response.json() if response.status_code == 200 else None
            }
            
            if response.status_code != 200:
                result["error"] = response.text
            
        except Exception as e:
            result = {
                "test": "chunked_generation", 
                "status": "error",
                "error": str(e),
                "request": test_request
            }
        
        self.results.append(result)
        print(f"   ✅ Chunked generation: {result['status']} ({result.get('duration', 0):.2f}s)")
        
        if result.get("data") and result["status"] == "success":
            data = result["data"]
            print(f"      📚 Generated {data.get('total_chunks', 0)} chunks")
            print(f"      📚 Success: {data.get('success', False)}")
            
            # Analyze chunks
            chunks = data.get("chunks", [])
            for chunk in chunks:
                events = chunk.get("timeline_events", [])
                print(f"      📝 Chunk {chunk.get('chunk_number', 0)}: {len(events)} events, "
                      f"{chunk.get('generation_time', 0):.2f}s to generate")
        
        return result
    
    async def test_generation_stats(self) -> Dict[str, Any]:
        """Test generation statistics endpoint"""
        print("🔍 Testing generation statistics...")
        
        try:
            response = await self.client.get(f"{API_BASE}/lesson/generation-stats")
            result = {
                "test": "generation_stats",
                "status": "success" if response.status_code == 200 else "failed", 
                "response_code": response.status_code,
                "data": response.json() if response.status_code == 200 else None
            }
            
            if response.status_code != 200:
                result["error"] = response.text
            
        except Exception as e:
            result = {
                "test": "generation_stats",
                "status": "error",
                "error": str(e)
            }
        
        self.results.append(result)
        print(f"   ✅ Generation stats: {result['status']}")
        
        if result.get("data") and result["status"] == "success":
            data = result["data"]
            print(f"      📈 Status: {data.get('status')}")
            if data.get("total_chunks_generated"):
                print(f"      📈 Total chunks: {data.get('total_chunks_generated')}")
                print(f"      📈 Success rate: {data.get('success_rate', 0):.2f}")
                print(f"      📈 Avg generation time: {data.get('average_generation_time', 0):.2f}s")
        
        return result
    
    async def test_standard_lesson_generation(self) -> Dict[str, Any]:
        """Test standard lesson generation for comparison"""
        print("🔍 Testing standard lesson generation (baseline)...")
        
        try:
            # Create lesson first
            create_request = {
                "topic": "Photosynthesis basics",
                "difficulty_level": "beginner"
            }
            
            create_response = await self.client.post(
                f"{API_BASE}/lesson",
                json=create_request
            )
            
            if create_response.status_code != 200:
                raise Exception(f"Failed to create lesson: {create_response.text}")
            
            lesson_data = create_response.json()
            lesson_id = lesson_data["id"]
            
            # Generate content
            start_time = time.time()
            gen_response = await self.client.post(
                f"{API_BASE}/lesson/{lesson_id}/generate"
            )
            duration = time.time() - start_time
            
            result = {
                "test": "standard_generation",
                "status": "success" if gen_response.status_code == 200 else "failed",
                "response_code": gen_response.status_code,
                "duration": duration,
                "lesson_id": lesson_id,
                "data": gen_response.json() if gen_response.status_code == 200 else None
            }
            
            if gen_response.status_code != 200:
                result["error"] = gen_response.text
            
        except Exception as e:
            result = {
                "test": "standard_generation",
                "status": "error", 
                "error": str(e)
            }
        
        self.results.append(result)
        print(f"   ✅ Standard generation: {result['status']} ({result.get('duration', 0):.2f}s)")
        
        if result.get("data") and result["status"] == "success":
            data = result["data"]
            steps = data.get("steps", [])
            print(f"      📚 Generated {len(steps)} steps")
            
            total_duration = sum(step.get("duration", 0) for step in steps)
            print(f"      📚 Total content duration: {total_duration:.1f}s")
        
        return result
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Phase 2 Feature Testing\n")
        
        tests = [
            self.test_health_check,
            self.test_llm_health,
            self.test_standard_lesson_generation,  # Baseline first
            self.test_topic_analysis,
            self.test_chunked_generation,
            self.test_generation_stats,
        ]
        
        for test in tests:
            try:
                await test()
                print()  # Add spacing between tests
            except Exception as e:
                print(f"   ❌ Test failed with exception: {e}\n")
        
        await self.print_summary()
    
    async def print_summary(self):
        """Print test summary"""
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.results)
        successful_tests = len([r for r in self.results if r.get("status") == "success"])
        failed_tests = len([r for r in self.results if r.get("status") == "failed"])
        error_tests = len([r for r in self.results if r.get("status") == "error"])
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Successful: {successful_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"🚨 Errors: {error_tests}")
        print(f"📈 Success Rate: {(successful_tests/total_tests)*100:.1f}%")
        
        print("\n📋 DETAILED RESULTS:")
        for result in self.results:
            status_emoji = "✅" if result["status"] == "success" else "❌" if result["status"] == "failed" else "🚨"
            test_name = result["test"].replace("_", " ").title()
            duration = result.get("duration", 0)
            duration_str = f" ({duration:.2f}s)" if duration > 0 else ""
            
            print(f"{status_emoji} {test_name}{duration_str}")
            
            if result["status"] != "success" and "error" in result:
                print(f"   💥 {result['error']}")
        
        print("\n🔍 PHASE 2 FEATURE STATUS:")
        
        # Check if chunked generation is working
        chunked_test = next((r for r in self.results if r["test"] == "chunked_generation"), None)
        if chunked_test and chunked_test["status"] == "success":
            print("✅ Chunked Content Generation: WORKING")
        else:
            print("❌ Chunked Content Generation: NOT WORKING")
        
        # Check if topic analysis is working  
        analysis_test = next((r for r in self.results if r["test"] == "topic_analysis"), None)
        if analysis_test and analysis_test["status"] == "success":
            print("✅ Topic Analysis & Chunk Sizing: WORKING")
        else:
            print("❌ Topic Analysis & Chunk Sizing: NOT WORKING")
        
        # Compare performance if both tests succeeded
        standard_test = next((r for r in self.results if r["test"] == "standard_generation"), None)
        if (chunked_test and chunked_test["status"] == "success" and 
            standard_test and standard_test["status"] == "success"):
            
            standard_time = standard_test.get("duration", 0)
            chunked_time = chunked_test.get("duration", 0)
            
            if standard_time > 0 and chunked_time > 0:
                perf_ratio = chunked_time / standard_time
                print(f"\n⚡ PERFORMANCE COMPARISON:")
                print(f"   Standard Generation: {standard_time:.2f}s")
                print(f"   Chunked Generation: {chunked_time:.2f}s")
                print(f"   Performance Ratio: {perf_ratio:.2f}x")
                
                if perf_ratio < 1.2:
                    print("   ✅ Chunked generation is competitive (within 20%)")
                else:
                    print("   ⚠️  Chunked generation is slower than baseline")
        
        print("\n" + "=" * 60)
    
    async def close(self):
        """Clean up resources"""
        await self.client.aclose()


async def main():
    """Main test runner"""
    tester = Phase2Tester()
    
    try:
        await tester.run_all_tests()
    finally:
        await tester.close()


if __name__ == "__main__":
    asyncio.run(main())