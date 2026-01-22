"""
Test script for Drafted.ai floor plan generation.

Run with:
    cd editing
    python test_drafted.py

Make sure to set DRAFTED_API_ENDPOINT environment variable first.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from drafted_client import (
    DraftedFloorPlanClient,
    DraftedPromptBuilder,
    RoomsCatalog,
    RoomSpec,
    GenerationConfig,
    create_default_config
)


def test_catalog():
    """Test the rooms catalog parsing."""
    print("\n" + "="*60)
    print("ROOMS CATALOG TEST")
    print("="*60)
    
    catalog = RoomsCatalog()
    
    # Test basic lookup
    print(f"\nLoaded {len(catalog.get_all_room_types())} room types")
    
    # Test primary rooms
    test_cases = [
        ("primary_bedroom", "S", "Intimate"),
        ("primary_bedroom", "M", "Retreat"),
        ("primary_bedroom", "L", "Suite"),
        ("primary_bedroom", "XL", "Presidential"),
        ("primary_bathroom", "M", "Spa"),
        ("primary_closet", "L", "Showroom"),
        ("kitchen", "M", "Galley"),
        ("living", "M", "Lounge"),
        ("garage", "M", "Tandem"),
        ("office", "M", "Workroom"),
        ("pool", "M", "Lap"),
    ]
    
    print("\nPrompt name mapping:")
    for room_type, size, expected in test_cases:
        actual = catalog.get_prompt_name(room_type, size)
        status = "✓" if actual and actual.lower() == expected.lower() else "✗"
        print(f"  {status} {room_type} {size} -> {actual} (expected: {expected})")
    
    # Test sqft calculation
    print("\nSqft midpoints:")
    for room_type, size, _ in test_cases[:5]:
        midpoint = catalog.get_sqft_midpoint(room_type, size)
        print(f"  {room_type} {size}: {midpoint:.0f} sqft")
    
    # Test priority ordering
    print("\nRoom priorities (lower = earlier in prompt):")
    priorities = [
        ("primary_bedroom", catalog.get_priority("primary_bedroom")),
        ("primary_bathroom", catalog.get_priority("primary_bathroom")),
        ("primary_closet", catalog.get_priority("primary_closet")),
        ("bedroom", catalog.get_priority("bedroom")),
        ("kitchen", catalog.get_priority("kitchen")),
        ("living", catalog.get_priority("living")),
    ]
    for room, priority in sorted(priorities, key=lambda x: x[1]):
        print(f"  {priority:2d}: {room}")


def test_prompt_builder():
    """Test prompt generation."""
    print("\n" + "="*60)
    print("PROMPT BUILDER TEST")
    print("="*60)
    
    catalog = RoomsCatalog()
    builder = DraftedPromptBuilder(catalog)
    
    # Test basic config
    config = GenerationConfig(
        rooms=[
            RoomSpec("primary_bedroom", "L"),
            RoomSpec("primary_bathroom", "M"),
            RoomSpec("primary_closet", "L"),
            RoomSpec("bedroom", "M"),
            RoomSpec("bedroom", "M"),
            RoomSpec("bathroom", "S"),
            RoomSpec("dining", "M"),
            RoomSpec("garage", "M"),
            RoomSpec("kitchen", "M"),
            RoomSpec("laundry", "M"),
            RoomSpec("living", "M"),
            RoomSpec("office", "M"),
            RoomSpec("outdoor_living", "M"),
            RoomSpec("pantry", "S"),
            RoomSpec("pool", "M"),
        ]
    )
    
    prompt = builder.build_prompt(config)
    tokens = builder.estimate_tokens(prompt)
    
    print(f"\nGenerated prompt ({tokens} estimated tokens):")
    print("-" * 40)
    print(prompt)
    print("-" * 40)
    
    # Test token limit warning
    if tokens > 77:
        print(f"\n⚠️  WARNING: Prompt exceeds 77 token limit!")
    else:
        print(f"\n✓ Prompt is within 77 token limit")
    
    # Test prompt modification for editing
    print("\n\nTesting prompt modification (editing):")
    modified = builder.modify_prompt_for_edit(
        prompt,
        add_rooms=[RoomSpec("office", "M")],
        adjust_sqft=500
    )
    print("-" * 40)
    print(modified)
    print("-" * 40)


def test_default_configs():
    """Test default configuration presets."""
    print("\n" + "="*60)
    print("DEFAULT CONFIGS TEST")
    print("="*60)
    
    builder = DraftedPromptBuilder()
    
    configs = [
        ("Small 2BR/2BA", create_default_config(bedrooms=2, bathrooms=2, style="S")),
        ("Medium 3BR/2BA", create_default_config(bedrooms=3, bathrooms=2, style="M")),
        ("Large 4BR/3BA", create_default_config(bedrooms=4, bathrooms=3, style="L")),
    ]
    
    for name, config in configs:
        prompt = builder.build_prompt(config)
        tokens = builder.estimate_tokens(prompt)
        sqft = builder.catalog.calculate_total_sqft(config.rooms)
        
        print(f"\n{name}:")
        print(f"  Rooms: {len(config.rooms)}")
        print(f"  Est. sqft: {sqft}")
        print(f"  Tokens: {tokens}")


async def test_api():
    """Test the actual API (if endpoint is configured)."""
    print("\n" + "="*60)
    print("API TEST")
    print("="*60)
    
    endpoint = os.getenv("DRAFTED_API_ENDPOINT")
    if not endpoint:
        print("\n⚠️  DRAFTED_API_ENDPOINT not set - skipping API test")
        print("   Set it to your Runpod endpoint URL to test")
        return
    
    print(f"\nEndpoint: {endpoint}")
    
    try:
        client = DraftedFloorPlanClient(endpoint)
        
        # Simple generation test
        config = create_default_config(bedrooms=2, bathrooms=2, style="M")
        
        print("\nGenerating floor plan...")
        result = await client.generate(config)
        
        print(f"\nResult:")
        print(f"  Success: {result.success}")
        print(f"  Plan ID: {result.plan_id}")
        print(f"  Seed: {result.seed_used}")
        print(f"  Elapsed: {result.elapsed_seconds:.2f}s")
        print(f"  Rooms: {len(result.rooms)}")
        print(f"  Total area: {result.total_area_sqft:.0f} sqft")
        
        if result.error:
            print(f"  Error: {result.error}")
        
        if result.rooms:
            print("\n  Detected rooms:")
            for room in result.rooms:
                print(f"    - {room.room_type}: {room.area_sqft:.0f} sqft")
        
        if result.svg:
            print(f"\n  SVG: {len(result.svg)} characters")
        
        if result.image_bytes:
            print(f"  Image: {len(result.image_bytes)} bytes")
            
            # Save test image
            output_path = Path(__file__).parent / "test_output.jpg"
            with open(output_path, "wb") as f:
                f.write(result.image_bytes)
            print(f"  Saved to: {output_path}")
        
        # Test seed-based editing
        if result.success:
            print("\n\nTesting seed-based editing...")
            print("Adding office and increasing sqft by 500...")
            
            edited = await client.edit_with_seed(
                result,
                add_rooms=[RoomSpec("office", "M")],
                adjust_sqft=500
            )
            
            print(f"\nEdited result:")
            print(f"  Success: {edited.success}")
            print(f"  Seed: {edited.seed_used} (should match: {result.seed_used})")
            print(f"  Rooms: {len(edited.rooms)}")
            print(f"  Total area: {edited.total_area_sqft:.0f} sqft")
            
            if edited.image_bytes:
                output_path = Path(__file__).parent / "test_output_edited.jpg"
                with open(output_path, "wb") as f:
                    f.write(edited.image_bytes)
                print(f"  Saved to: {output_path}")
    
    except Exception as e:
        print(f"\n✗ API test failed: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run all tests."""
    print("="*60)
    print("DRAFTED.AI CLIENT TESTS")
    print("="*60)
    
    test_catalog()
    test_prompt_builder()
    test_default_configs()
    await test_api()
    
    print("\n" + "="*60)
    print("TESTS COMPLETE")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())








