-- Mass dedupe migration — 65 restaurants, 282 dish merges.
-- Generated 2026-05-18 from sweep of all 6380 dishes.
-- Same proven DO-block pattern as Red Cat + Back Door dedupes.
-- Keeper = highest total_votes; tiebreak on longest name.

BEGIN;

SET LOCAL row_security = off;

DO $$
DECLARE pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('032a4611-cf82-493d-8eb0-7293e68c0024'::uuid, '44bfffa8-bb25-4cd5-a403-690cb3d3efe6'::uuid), -- [Dune] Fish Tacos <- Fish Tacos
      ('7176dbf7-4b33-4e08-8c31-fa266832982f'::uuid, '728ba556-8829-4b19-bee2-c973d6ad28e1'::uuid), -- [Dune] Lobster BLT <- Lobster BLT
      ('b84f05c4-550e-4e24-b77f-9d6ae2f74242'::uuid, 'd2b84980-72e7-43f3-8967-1fc8dbe1718f'::uuid), -- [Dune] Seared Tuna Bowl <- Seared Tuna Bowl
      ('a3cf1e55-fc95-48a3-9129-81ad74f6b5b5'::uuid, '9eef3fd0-487d-471f-83a7-cae35faf6525'::uuid), -- [Dune] Fried Chicken Sandwich <- Fried Chicken Sandwich
      ('bb66e5fa-b735-4601-9311-cc7e9fcbcf1d'::uuid, '8f99a7c4-35dc-4bea-b87c-e9f2a7f3148d'::uuid), -- [Galley Beach] Wagyu Beef <- Wagyu Beef
      ('f0056ea0-d77f-4258-ad73-bff02bfc2490'::uuid, 'a04e6730-8ab3-48b1-99cd-be81806a06b7'::uuid), -- [Galley Beach] Sunset Cocktail & Raw Bar Platter <- Sunset Cocktail & Raw Bar Platter
      ('7ca07edf-f61b-40b2-a5ea-6390d8c865ea'::uuid, '0815da1b-fc74-4aa4-8ebb-590429109854'::uuid), -- [Galley Beach] Lobster Thermidor <- Lobster Thermidor
      ('5d839ba1-821c-40ad-a563-2e8ffcba7837'::uuid, '24ae1de8-d751-4aa9-a9bd-be94481893fb'::uuid), -- [Galley Beach] Tuna Tartare <- Tuna Tartare
      ('ccd68d19-350b-4d49-96fb-49cd27d091ac'::uuid, '7e2e2e14-14fe-4e68-8a66-41da4ee1195a'::uuid), -- [Anejo Mexican Bistro] CARNE ASADA <- Carne Asada
      ('df1d12c1-7308-4652-bad4-eb1c28163157'::uuid, '66f4a349-742a-4f5f-9cc1-bd1c4949c303'::uuid), -- [The Summer House] Sconset Sunset Cocktail <- Sconset Sunset Cocktail
      ('88633d68-dc7a-4861-8659-5ca10659e147'::uuid, '50d12d5a-5c07-46ae-9cc5-b316d5bc0a4e'::uuid), -- [The Summer House] Lobster Bisque <- Lobster Bisque
      ('3221ba24-5e7d-41b9-bf47-b002208ef89a'::uuid, '86adbe65-f7e7-4f0b-8027-a83e21ee787b'::uuid), -- [The Summer House] Pan-Seared Halibut <- Pan-Seared Halibut
      ('d8c0ebf9-ef7b-41a4-b6fc-3442d43ad745'::uuid, 'acddf862-02fb-4739-bfc2-6401cc654333'::uuid), -- [The Summer House] Filet Mignon <- Filet Mignon
      ('48b2a9ed-78dd-40a1-852c-63e4143cfdd7'::uuid, 'b7c9dc13-7d48-42f8-ae6a-df16e4ea150f'::uuid), -- [Rockfish] Veggie Tacos <- Veggie Taco
      ('aa3193d9-330c-4ac0-b003-a3b99bd9da6a'::uuid, 'b0c213f8-8559-4328-8bd2-13f060721010'::uuid), -- [Rockfish] Seared Cod Tacos <- Seared Cod Taco
      ('fdcc9912-b3a1-4112-9f02-641e25165aaf'::uuid, '94da3a7c-65c1-4d47-b862-bcf7c6b01c56'::uuid), -- [Rockfish] Short Rib Tacos <- Short Rib Taco
      ('9cfd2f4c-1f35-4c70-8a9d-dbd00aefc69f'::uuid, '9b7675d1-dfbd-4e92-9cf2-555a3c0577d3'::uuid), -- [Rockfish] Sautéed Lobster Tacos <- Sautéed Lobster Taco
      ('314b55e4-c58c-46d3-841c-875f15a94b3d'::uuid, '95bcd43a-64f0-4bd1-9490-92472086ce80'::uuid), -- [Rockfish] Chef's Special Burger! <- Chef's Special Burger
      ('2d6446c3-97f3-46e3-8d06-e3a6b7326dcc'::uuid, '1ea56cd4-ec7d-4795-8f5c-74858347a273'::uuid), -- [The Lobster Trap] 1.5 lb Steamed Lobster <- 1.5 lb Steamed Lobster
      ('ba397191-292a-4689-b481-df50f2fc4f08'::uuid, '19b9ddce-9065-4bf9-84c0-92271f6ad9f8'::uuid), -- [The Lobster Trap] Lobster Roll <- Lobster Roll
      ('8ae16147-e423-495f-9b43-66bf852683f2'::uuid, 'ca487f0a-3cee-42fe-b942-b113a831694f'::uuid), -- [The Lobster Trap] Fried Calamari <- Fried Calamari
      ('0f878ca4-4604-40f9-abf7-2cd6d98115ee'::uuid, '69b03a2d-8d6d-46b2-bf0d-51061316dbe3'::uuid), -- [The Lobster Trap] New England Clam Chowder <- New England Clam Chowder
      ('535e3ef8-29dd-4d56-9cac-c9f24180ac19'::uuid, '60a00da4-f91e-40df-bd41-c8eb83a8e707'::uuid), -- [The Lobster Trap] Baked Stuffed Lobster <- Baked Stuffed Lobster
      ('43aa9257-226a-49e5-be1b-426fbf7c6632'::uuid, '42f846c9-fdac-4113-830b-df933bd7d927'::uuid), -- [The Juice Bar] Frappe <- Frappe
      ('6109830d-bef7-4032-84bb-2790836124f5'::uuid, '24d590ae-0c34-4135-823b-ed1dff078980'::uuid), -- [The Juice Bar] Frozen Lemonade <- Frozen Lemonade
      ('9ab88bcb-d94f-4a58-bb7e-bf36437c04e3'::uuid, 'f6e1ac99-be13-47a3-b82e-a9206485aca0'::uuid), -- [The Juice Bar] Homemade Ice Cream Cone <- Homemade Ice Cream Cone
      ('beacaf82-e695-42c6-bb6a-18f40f732ba5'::uuid, '9ea1e2fb-9047-4e7b-a863-dad7f7cbb96b'::uuid), -- [The Juice Bar] Hot Fudge Sundae <- Hot Fudge Sundae
      ('74fa272f-6afc-4677-a1fe-a2557c83822e'::uuid, 'a536530a-1233-46d1-8ce7-dd39d3de601e'::uuid), -- [Sconset Cafe] Clam Chowder <- Clam Chowder
      ('47535279-2aca-44b9-a517-c7a386992a06'::uuid, 'c53f239e-3b76-4bb0-9747-44f9a95f6b20'::uuid), -- [Sconset Cafe] Lobster Roll <- Lobster Roll
      ('3fe00b9f-5a79-4647-9006-d5219e097e18'::uuid, 'd01e8863-87ef-4143-985e-e819fd5aa9fe'::uuid), -- [Sconset Cafe] Blueberry Pancakes <- Blueberry Pancakes
      ('8f8959d2-f37c-4fe6-adb6-75fc43222ce9'::uuid, '51fca298-057d-47ab-98a1-61bfc28dc8e0'::uuid), -- [Island Kitchen] Granny Smith Apple & Goat Cheese <- Granny Smith Apple & Goat Cheese
      ('451be5e3-cca1-49ed-8102-bb21f896488a'::uuid, '127e7826-748d-4228-a63f-c4318ed26a87'::uuid), -- [Island Kitchen] Chicken Milanese <- Chicken Milanese
      ('47ff15ef-4925-4cb9-b740-c0dfc6ca7526'::uuid, 'c726bf10-c26b-46a7-a93f-8ae826331ffc'::uuid), -- [Island Kitchen] Chicken Parmesan <- CHICKEN PARMESAN
      ('5208a3da-4a9f-4297-84cd-c79e907f2476'::uuid, '5c393064-4ffe-43d3-a019-03bc3b7fc84c'::uuid), -- [Island Kitchen] Korean Ahi Tuna Package <- Korean Ahi Tuna Package
      ('b4c79a38-6d3a-4b6e-907e-4119b3c087f7'::uuid, '9e366984-413a-4e2e-85f5-38f202508516'::uuid), -- [Island Kitchen] IK Cheeseburger <- IK CHEESEBURGER
      ('6d895a5a-36da-48e1-a453-9e22c128c8f9'::uuid, '78376f09-4193-4804-993f-e34a5b58a0e9'::uuid), -- [Island Kitchen] IK Shaved Brussels Sprouts Caesar <- IK Shaved Brussels Sprouts Caesar
      ('0021afcd-6368-483c-ae01-ce1992b4c8f0'::uuid, '9bf3d916-8007-427d-a0c7-72b3ad4a31e1'::uuid), -- [Island Kitchen] Grilled Flat Iron Steak <- GRILLED FLAT IRON STEAK
      ('27de18a5-5c23-4300-8fee-5a639a8d9a43'::uuid, '44e742f3-e882-4d42-8974-fd5484c97b2b'::uuid), -- [Centre Street Bistro] Blueberry Pancakes <- Blueberry Pancakes
      ('c1aa9e80-b40f-4bc5-9f0f-7dd08fecfd09'::uuid, 'dfab0732-83a5-46f6-a7f2-f4ba0c03dc14'::uuid), -- [Centre Street Bistro] Eggs Benedict <- Eggs Benedict
      ('d5726bf1-feeb-4697-9318-c47cf475f263'::uuid, 'db31e105-6151-47d5-ad37-d0269d65ea4b'::uuid), -- [Centre Street Bistro] Lobster Omelet <- Lobster Omelet
      ('c100c72e-1779-47e5-a769-731613c4034e'::uuid, 'c7310a04-9c14-4405-9890-deb80bf3880d'::uuid), -- [Brotherhood of Thieves] Wings <- Wings
      ('9b881dad-05e1-4073-83a0-bebcaeb636da'::uuid, 'a3eec607-a37e-4f28-9fd2-6099dd407aab'::uuid), -- [Brotherhood of Thieves] Pub Burger <- Pub Burger
      ('6e93e577-85bd-404b-abb6-b03096cde5f5'::uuid, 'bfc97e5b-b751-4093-b1e9-096b85afc314'::uuid), -- [Brotherhood of Thieves] Fish & Chips <- Fish & Chips
      ('50f49aa8-fe1e-46fd-bbe5-5f11cd83d315'::uuid, '201eeb24-44c9-44d9-b1e2-897489caee0a'::uuid), -- [Brotherhood of Thieves] New England Clam Chowder <- New England Clam Chowder
      ('3d02b490-bbd0-4e2e-b8ad-c628af59ed5d'::uuid, '62e6dbe0-02c9-4bbb-8ac3-d7a85d1f828c'::uuid), -- [Brotherhood of Thieves] Curly Fries <- Curly Fries
      ('9073dc31-a680-465a-b438-d87c48c62250'::uuid, '161e9dab-e010-4f18-ae2c-0bc0e47c8416'::uuid), -- [Greydon House] Greydon Burger <- Greydon Burger
      ('8d40b1cc-5b66-4573-a9c2-7d9bf81b8735'::uuid, 'e91e9d0a-1188-4dff-8298-20cc462a18c8'::uuid), -- [Greydon House] Seasonal Risotto <- Seasonal Risotto
      ('e5119af2-cea2-42c8-a65b-1ae5348c69a8'::uuid, 'f0eedb13-0a4b-470d-98a6-5a2c91b16b02'::uuid), -- [Greydon House] Tuna Crudo <- Tuna Crudo
      ('a90a9aaa-16e0-4000-bf2e-36c114c678e5'::uuid, '6650879c-cfab-4d44-a504-218c9f3d4853'::uuid), -- [Greydon House] Roasted Chicken <- Roasted Chicken
      ('228c3504-dd34-4e34-98aa-5958c30c7bb0'::uuid, 'c9779a6a-e2ad-4c97-8f9e-91b1cf18582e'::uuid), -- [The Newes From America] *1742 BURGER <- 1742 Burger
      ('475c46ee-30c9-43c5-a06e-633a00b7ad5d'::uuid, 'f37a7d5f-68b2-402b-b36d-bf78d3017ad4'::uuid), -- [The Newes From America] SPINACH & ARTICHOKE DIP <- Spinach Artichoke Dip
      ('74cb4bb5-692f-4580-9ab2-4095b970388a'::uuid, '800ea691-1220-4d1e-b893-bd9d294e25de'::uuid), -- [Something Natural] Portuguese Bread Sandwich <- Portuguese Bread Sandwich
      ('36e3545d-7b1e-4cbd-b07f-d7ced9043eac'::uuid, 'b80d3fe1-83e9-4469-9fc8-610a019428cc'::uuid), -- [Something Natural] Herb Chicken Sandwich <- Herb Chicken Sandwich
      ('0144ef4a-5252-4bac-a9f4-ac40278d8505'::uuid, 'a40f55c4-faa9-4dab-abbd-e90346e058e3'::uuid), -- [Something Natural] Turkey & Avocado <- Turkey & Avocado
      ('0310d09c-7f55-49c5-a61f-3dfc689b9cbb'::uuid, 'cd90f039-74d7-4f48-b0c1-f4f55fe89088'::uuid), -- [Something Natural] Chocolate Chip Cookie <- Chocolate Chip Cookie
      ('c1cada64-e9a7-42b9-bff0-560891cf784d'::uuid, 'c6e50d85-4032-4f4c-9357-f8adc9dd149b'::uuid), -- [Easy Street Cantina] Quesadilla <- Quesadilla
      ('7a138406-0c0c-4a24-b9dc-6911096d227a'::uuid, '7e010670-0cc4-4a85-a80b-4a90e7ddf210'::uuid), -- [Easy Street Cantina] Nachos Grande <- Nachos Grande
      ('d7338f49-d8e3-4f60-bd0b-35c51f75da21'::uuid, '0eed6613-fbb6-47dd-8164-583df37e9707'::uuid), -- [Easy Street Cantina] Lobster Burrito <- Lobster Burrito
      ('0f27e6c7-0a4a-4409-a9eb-3ed65532b337'::uuid, 'c3136c3a-fe63-43ff-8232-b09a894fd772'::uuid), -- [Easy Street Cantina] Fish Tacos <- Fish Tacos
      ('21d4668f-4c69-4f11-a454-564305ed1a4e'::uuid, 'f436b30a-c3e1-46d3-a1f7-dbcd0aaa7037'::uuid), -- [167 Raw] Poke Bowl <- Poke Bowl
      ('28a5c7d1-cc1a-4690-a731-6b75d269f3bc'::uuid, '494088e6-4e58-4957-a4d8-46f6d6114a25'::uuid), -- [167 Raw] Shrimp Ceviche <- Shrimp Ceviche
      ('3cc6b59d-d1d9-4fb6-9b53-2490a461966f'::uuid, '69d28eff-fba6-415e-aeed-a093ab452625'::uuid), -- [167 Raw] Oysters on the Half Shell <- Oysters on the Half Shell
      ('ef7c9905-43c7-45cb-acd7-264f251bb14e'::uuid, '39df9c1b-2c92-446c-921f-45c9ef1dac33'::uuid), -- [167 Raw] Lobster Roll <- Lobster Roll
      ('192e78ca-b801-414e-8d2e-fff6a6a26518'::uuid, '53f59c67-34fc-4b61-a0eb-af621fd8b69c'::uuid), -- [167 Raw] Fish Tacos <- Fish Tacos
      ('10c754b1-79c6-4cb7-be8c-e1a6b092dc62'::uuid, '838a4512-1ab8-45e1-90a4-e6b316b5786e'::uuid), -- [Landfall Restaurant] Club Sandwich <- Club Sandwich
      ('c770db3f-8d74-4eef-91cf-a272cf4cb335'::uuid, '41659765-feee-4555-87e0-64aa80b17670'::uuid), -- [Landfall Restaurant] Steak Tips <- Steak Tips
      ('e4539e38-8485-44d4-99f3-6ef0a568dd61'::uuid, 'a4f955d6-c14d-4548-b7be-eeb7a6e0fd2d'::uuid), -- [Landfall Restaurant] Broiled Scrod with seasoned crumbs <- Broiled Scrod with seasoned crumbs
      ('bf5efbb9-1e35-403a-9612-2120c8af8a5a'::uuid, 'bb688e31-becb-49af-88ea-60a16c8a38e2'::uuid), -- [Landfall Restaurant] Veggie Burger <- Veggie Burger
      ('4f59b447-5736-4590-8537-eb9f4d6e586d'::uuid, '4bc89c1d-167a-4316-b0c3-51e96ffd0612'::uuid), -- [Landfall Restaurant] Lobster Roll <- Lobster Roll
      ('a09281d9-c4b7-4979-8cd0-91da7e2e2ae0'::uuid, 'd0c4db63-48ac-459b-bad5-459829a0a4d2'::uuid), -- [Landfall Restaurant] Vanilla Ice Cream <- Vanilla Ice Cream
      ('63be8ca3-26e0-4eb3-8d7e-1ca350d661ff'::uuid, '04043cf4-c81b-43e0-8f01-41ae1f6608d1'::uuid), -- [Landfall Restaurant] Summer Berry Cobbler <- Summer Berry Cobbler
      ('d516e439-a5c4-42ed-81c5-aff75514745a'::uuid, '36b80ee9-d409-4985-84be-2c9dcb1dfd97'::uuid), -- [SeaGrille] Baked Stuffed Shrimp <- Baked Stuffed Shrimp
      ('26404e31-ec41-42d6-bc67-dab2b0860960'::uuid, 'bea41e60-ccea-48d4-be2f-51da01d91edb'::uuid), -- [SeaGrille] Grilled Swordfish <- Grilled Swordfish
      ('be705e36-6dfd-4b47-93dd-95cb2e5f2e04'::uuid, '311e9e01-9652-45c9-8ce8-0abf3eddceb2'::uuid), -- [SeaGrille] Nantucket Bay Scallops <- Nantucket Bay Scallops
      ('b29686d2-62d0-44a0-bfed-fb27e4217f98'::uuid, 'af94a0a5-6572-4261-a23d-2721eb7939a0'::uuid), -- [SeaGrille] Raw Bar Sampler <- Raw Bar Sampler
      ('f78570bc-7447-4ab0-bd6b-1f37eb1c87dd'::uuid, 'd3053732-7308-4c4e-8f41-7580eb40adb6'::uuid), -- [Yummy] Milk Shakes <- Milk Shake
      ('b6c37d77-5588-4165-bf18-86ae31d1ff41'::uuid, 'c1b706e5-481d-45e4-be44-aa3a89d95bfe'::uuid), -- [Town Bar] Town Burger* <- Town Burger
      ('4301c306-5d45-48d2-b0c8-10c2f7efbe0d'::uuid, '4525cb08-218f-42c4-9401-8637f90bb954'::uuid), -- [Town Bar] Big Mac Sliders* <- Big Mac Sliders
      ('a17f282d-6240-46d7-bfa1-dbbe80a45590'::uuid, '21137de5-960a-43fe-b8a0-c384c3e04890'::uuid), -- [Town Bar] Smash Burger* <- Smash Burger
      ('70d6934d-f631-4756-86a0-835e184ce008'::uuid, 'e1fd5bb6-5c7c-40b7-9214-48afea7a393c'::uuid), -- [Company of the Cauldron] Pan-Seared Halibut <- Pan-Seared Halibut
      ('14cfbe70-f827-44d2-87c5-278b78211b91'::uuid, '8cef3e7d-38d5-40b3-b9d4-01e2c00a02be'::uuid), -- [Company of the Cauldron] Beef Wellington <- Beef Wellington
      ('61eb4587-f537-4e61-9fdc-9a479cd87ee6'::uuid, '69672623-92ff-4667-81ac-892d2b27588f'::uuid), -- [Company of the Cauldron] Prix Fixe Appetizer Trio <- Prix Fixe Appetizer Trio
      ('e3c9c3fd-cb31-4512-858c-2ec69304d1bd'::uuid, '2db7d3ad-0fbc-49c1-ba8b-595fcb54f5d2'::uuid), -- [Company of the Cauldron] Chocolate Lava Cake <- Chocolate Lava Cake
      ('92ebf353-9b9f-4454-bfe0-693e89aeb221'::uuid, '9cd52868-13d0-4282-9b32-fdde661e09e6'::uuid), -- [Larsen's Fish Market] Mussels <- Mussels
      ('f70cf87f-17aa-4e68-84a0-0c50746bd1ba'::uuid, '2edde7ed-b829-4fce-a541-7291312b0673'::uuid), -- [Fat Baby] Hamachi <- Hamachi
      ('1a74bddd-016f-444b-8464-f5c4b4d7a30c'::uuid, '7e356f50-f048-4388-a32e-cd1fd5868e9a'::uuid), -- [Fat Baby] Spicy Tuna <- Spicy Tuna
      ('721a9a51-0354-43f6-89c6-9ba6d316a553'::uuid, 'bfdc5ec1-eda4-4b3a-9cf9-d0ee51dc1446'::uuid), -- [Offshore Ale Company] NEW ENGLAND CLAM CHOWDER* <- New England Clam Chowder
      ('6e175a1a-8a14-42c5-8931-e17d042ccf62'::uuid, '0857ad89-0d7e-4bd7-9b83-4f02ac592aed'::uuid), -- [The Chanticleer] 8oz American Wagyu Bavette* <- 8oz American Wagyu Bavette
      ('9400fcb0-6fd7-45d6-9fea-268b7e7905d7'::uuid, '58a213c6-4250-42a0-8525-04aa1e354f72'::uuid), -- [The Chanticleer] Chanti Burger* <- Chanti Burger
      ('e3c54fcc-d5f1-4c1b-b7f7-38aca3f3fb6f'::uuid, 'e187ec5a-9b5a-48f2-9229-344865a96bc3'::uuid), -- [The Chanticleer] Wagyu Bavette Steak Frites <- Wagyu Bavette Steak Frites*
      ('e2e3c3bb-59dd-4b08-85a7-3423ca73c5af'::uuid, '61550576-3568-45f9-b16a-6fda4ed5ffa1'::uuid), -- [The Chanticleer] Crème Brûlée <- Crème Brûlée
      ('0c3b9806-cba9-469c-8940-1f4288649612'::uuid, 'f580d276-88cc-4096-a4e5-e3a24bcdd88f'::uuid), -- [The Chanticleer] Dover Sole Meunière <- Dover Sole Meunière
      ('4e872bd9-1d48-4339-9bff-dab0421fc5fc'::uuid, 'ae9a6bbf-0082-4a3d-9bcc-a328ca2ba75a'::uuid), -- [The Chanticleer] Lobster Soufflé <- Lobster Soufflé
      ('bb83860a-866e-4acd-ad1a-b330de9cfefb'::uuid, '2b00b398-fde2-4094-8061-6f121425877c'::uuid), -- [The Chanticleer] Rack of Lamb <- Rack of Lamb
      ('54e0d50b-9837-4fa1-a494-21acd218b16a'::uuid, '5edf0362-0daf-42e8-9dbe-2e3c9e6e2b9b'::uuid), -- [The Chanticleer] Belgian Frites <- Belgian Frites
      ('5272a7b9-d07c-4962-b047-90ed2be15fdd'::uuid, '63f53154-2fba-4550-ad7a-ec9f76295a68'::uuid), -- [The Chanticleer] Seared Foie Gras <- Seared Foie Gras
      ('280eaf2f-5cd7-4e13-8f58-dd8c19c266cd'::uuid, '7e38ac5b-62d6-4cc3-a50a-c4d84d81d867'::uuid), -- [The Chicken Box] Fried Chicken Bucket <- Fried Chicken Bucket
      ('279ce236-8157-43ae-a172-fab0e96bc624'::uuid, 'f6a47910-90d7-4365-a77e-2df8dd847685'::uuid), -- [The Chicken Box] Chicken Tenders <- Chicken Tenders
      ('09fd8074-67dd-443e-8007-fd2ecabd83e2'::uuid, '2f0185b1-3002-40f5-abdf-999bc88df436'::uuid), -- [The Chicken Box] Wings <- Wings
      ('32a2a1f2-eb74-412d-a146-b59ff57fa0b1'::uuid, '010148fe-0bc8-456d-b75b-2e861fec7446'::uuid), -- [Lookout Tavern] Lobster Tacos <- Lobster Tacos
      ('f9de82e7-594a-4002-a983-b0b2910e06b0'::uuid, '66f9943f-e5e5-4456-acee-d0579b8e4ccc'::uuid), -- [Lookout Tavern] Lobster Mac & Cheese <- Lobster Mac & Cheese
      ('e191e50c-e282-4e3d-b6c1-aff589f0f728'::uuid, 'f16193b9-b9d0-4839-899d-5e81ac9ad59f'::uuid), -- [The Pearl] Wok-Charred Lobster <- Wok-Charred Lobster
      ('07193501-8f4b-4ebf-91a5-903aacdef6a7'::uuid, 'b92b2943-f7aa-4244-a986-83c5a863cd53'::uuid), -- [The Pearl] Tuna Tartare Tacos <- Tuna Tartare Tacos
      ('2f85ff72-f163-4e75-b16d-aeedb174fa28'::uuid, '10587cd3-2010-41c1-9ba4-61acad62635f'::uuid), -- [The Pearl] Asian Pear Salad <- Asian Pear Salad
      ('08e924b2-ceb2-4d8b-96fb-152342d3af36'::uuid, '6034b09b-32bc-40ba-917e-ebaa4a2484b1'::uuid), -- [The Pearl] Miso-Glazed Chilean Sea Bass <- Miso-Glazed Chilean Sea Bass
      ('5926389c-6888-4c8f-bb14-2f669b052250'::uuid, '09054031-7a93-43de-8c57-707c31ecc215'::uuid), -- [Shy Bird - South Boston] Piri Piri Chicken GF <- Piri Piri Chicken GF
      ('a3c89812-80da-4e6d-80b3-d8cf7c4f9270'::uuid, '49a98485-000e-4310-bd2e-35f6f0d46358'::uuid), -- [Shy Bird - South Boston] Ranch Fried Chicken Sandwich <- Ranch Fried Chicken Sandwich
      ('1f1009e1-70fc-4f38-ad9c-572dffa59089'::uuid, '346ce244-3120-4d4f-914d-ef80acd524b0'::uuid), -- [Shy Bird - South Boston] Truffled Chicken Frites GF <- Truffled Chicken Frites GF
      ('ae69dca1-39d4-4f53-8a49-c0c68fdf475e'::uuid, 'f0e76b59-331d-4453-88ce-815756a68ca9'::uuid), -- [Shy Bird - South Boston] "Coq au Vin" Frites <- "Coq au Vin" Frites
      ('780373a8-caf7-47ed-8c45-340f53b80fbf'::uuid, 'bb2208ef-23b5-4cbe-b80d-912967467846'::uuid), -- [Shy Bird - South Boston] SB Smash Burger <- SB Smash Burger
      ('762894c0-df2b-429d-bd58-b2542b2dea4a'::uuid, '09563e93-c10c-4aca-b3d0-8bd1cbdf304d'::uuid), -- [Shy Bird - South Boston] Rosemary-Pepper Fries GF VG <- Rosemary-Pepper Fries GF VG
      ('23a995fd-0c20-4aea-bd88-e90f5c616ac7'::uuid, '6b4acf4d-3b19-4d78-9d66-53e82fd2b181'::uuid), -- [Stubbys] Milkshake <- Milkshake
      ('affa62e9-1624-4494-981c-497c8a17e481'::uuid, '65e7be81-d6c1-4c0e-99e2-fb77e55bd5ff'::uuid), -- [Stubbys] Loaded Fries <- Loaded Fries
      ('eb4d9624-1cb1-4b62-b4b5-ac86b87916c1'::uuid, 'b17a247e-818b-404b-9282-e76ebf944208'::uuid), -- [Stubbys] Chicken Fingers <- Chicken Fingers
      ('141a01bf-612a-466e-89b6-6665ac179ec2'::uuid, 'fd6d2dfb-8bb3-4cda-8696-e9e8202e54e9'::uuid), -- [Stubbys] Smash Burger <- Smash Burger
      ('4d1d5dcd-df82-4a0b-876b-7df0a0d24417'::uuid, 'beeb7c84-32be-4f00-b682-f356ba6d834e'::uuid), -- [Sandbar at Jetties Beach] Frozen Margarita <- Frozen Margarita
      ('e1104b0f-43e5-4f4b-87d7-8294dc27fbc5'::uuid, '9d12dbc4-aedb-451b-bafd-e4e9bdc3dd0b'::uuid), -- [Sandbar at Jetties Beach] Lobster Roll <- Lobster Roll
      ('fd0cf9ea-45eb-45ec-b8e2-03c221e251ed'::uuid, 'fbfb6c47-f348-44c2-8101-f383196dec26'::uuid), -- [Sandbar at Jetties Beach] Fried Calamari <- Fried Calamari
      ('6eee9f24-9cd7-4bb9-bfc4-d97de709a29a'::uuid, '6e424d40-9e14-42ad-918e-707c2c7c1482'::uuid), -- [Sandbar at Jetties Beach] Fish Tacos <- Fish Tacos
      ('285e0848-1ba3-4bba-8888-9f0531716ede'::uuid, 'c757d001-9898-4115-8639-4a1e853dcb5a'::uuid), -- [Capo Restaurant & Supper Club] Meatballs <- Meatball
      ('fa66a0b8-6636-4ec3-a555-529108c63761'::uuid, 'a186cae0-f4c5-48c4-8689-40de74cc301d'::uuid), -- [Le Languedoc] Escargots <- Escargots
      ('0664dbd2-6c4d-4e61-8275-220c412cbc92'::uuid, '807463df-9dc4-4eae-b2e3-34f00bafd88f'::uuid), -- [Le Languedoc] Onion Soup Gratinée <- Onion Soup Gratinée
      ('402272fd-f28f-4c4d-a971-0e9e3406fa65'::uuid, '5e69fab0-d0d5-44ba-b842-041e8b0c32c6'::uuid), -- [Le Languedoc] Selection of Artisanal Cheeses <- Selection of Artisanal Cheeses
      ('92aa86c9-ed32-4132-9126-a5487f540c65'::uuid, '5d1d2a2d-444c-433b-bc26-348b7fab0bda'::uuid), -- [Le Languedoc] Steak Frites <- Steak Frites
      ('e82ae125-944b-4d2f-a790-eeb33f4f5372'::uuid, 'd3baab11-ab45-484e-8aee-8d86b56ba12f'::uuid), -- [Le Languedoc] Duck Confit <- Duck Confit
      ('03dd80e9-acc6-4a2b-97b7-8df7c6f27ba4'::uuid, '16620901-c15a-44a2-89f2-97379cd911e2'::uuid), -- [Or, The Whale] Main Burger <- Main Burger
      ('b8984372-cef2-4739-a06e-38fb22b4e01a'::uuid, '831a60ea-3c8c-468a-aef6-ef2661079684'::uuid), -- [Or, The Whale] Pimento Toast <- Pimento Toast
      ('de14e85e-ae15-48c4-a5c9-809b17c751c3'::uuid, 'b4d6b733-ffdf-4b4c-bfea-c6b30ad8dc40'::uuid), -- [Or, The Whale] Tuna Tostada <- Tuna Tostada
      ('de14e85e-ae15-48c4-a5c9-809b17c751c3'::uuid, '0c4dac7d-6012-4542-98c0-5218830466d8'::uuid), -- [Or, The Whale] Tuna Tostada <- Tuna Tostada
      ('86a29ea7-19c8-4cb9-8fe7-017577484bbc'::uuid, '0189866f-93db-46b9-b90f-9f751c52865a'::uuid), -- [Or, The Whale] Sonoran Hot Dog <- Sonoran Hot Dog
      ('d8cd2b56-e505-4513-aca8-2590e515c303'::uuid, '92a093d3-7cb8-47a4-91e0-03f3263e3564'::uuid), -- [Or, The Whale] Fried Calamari <- Fried Calamari
      ('69ae0aa6-81b0-4d04-bc18-854845e40fc5'::uuid, '81653160-8ff5-4b69-91ca-37a2d45c81b8'::uuid), -- [Or, The Whale] Fall Salad <- Fall Salad
      ('69ae0aa6-81b0-4d04-bc18-854845e40fc5'::uuid, '64c0b07c-83ef-4565-978a-cdac77131d88'::uuid), -- [Or, The Whale] Fall Salad <- Fall Salad
      ('4d1ef7e2-e2d8-40d3-8269-bd136ed9d257'::uuid, '7f3bb440-633a-4f92-a727-4905f9121eb2'::uuid), -- [Or, The Whale] Moules Poulette <- Moules Poulette
      ('4bee1e8e-3aa1-44da-b361-66c7f737b79d'::uuid, 'a4a4be78-9d61-4808-aec4-6005f67801d9'::uuid), -- [Or, The Whale] Soup Du Jour <- Soup Du Jour
      ('5b5901d5-f8ad-488d-b392-0e54553a8516'::uuid, '6379b36d-36a3-4b5a-b5ae-d5f4dd2e01ff'::uuid), -- [Or, The Whale] Fish & Chips <- Fish & Chips
      ('93473770-85e9-4335-ad00-5633f531870a'::uuid, 'b00df592-ba33-46b9-9b1d-c3848a135cb0'::uuid), -- [Or, The Whale] Falafel Gyro <- Falafel Gyro
      ('ec29d685-307f-41e9-958a-eae95637a50f'::uuid, '42a509cb-9938-4756-a034-2f956c24a639'::uuid), -- [Or, The Whale] Caesar Salad <- Caesar Salad
      ('ec29d685-307f-41e9-958a-eae95637a50f'::uuid, '7dbfc756-441d-44c0-aa61-06f58a601b02'::uuid), -- [Or, The Whale] Caesar Salad <- Caesar Salad
      ('862eda67-8bb3-45ea-9005-b4cdee8ea776'::uuid, '30bdbf50-af07-4747-866d-1d1369fdd919'::uuid), -- [Or, The Whale] oTW Wings <- oTW Wings
      ('885e698c-4893-4ea3-9c9d-ac7d8208cc12'::uuid, 'a76a9858-3fb9-4bea-8a06-4c4798a57659'::uuid), -- [Or, The Whale] French Onion Soup <- French Onion Soup
      ('52f5946d-016a-4875-ac86-84b1a45698bc'::uuid, 'c23035dd-2a97-4664-aa13-c796551f728e'::uuid), -- [Or, The Whale] Cheeseburger <- Cheeseburger
      ('ebdcc093-0191-4ab8-9533-4cad044f4802'::uuid, 'b68ffa63-1450-4ed5-882f-b9a605a7e369'::uuid), -- [Or, The Whale] Lobster Roll <- Lobster Roll
      ('9ca68bc3-b2f0-47d4-ae04-6bd49bbdabf7'::uuid, '7e33d932-ee20-460f-a22e-5be21837a4e0'::uuid), -- [Or, The Whale] Crispy Brussels Sprouts <- Crispy Brussels Sprouts
      ('20b6ffd8-d62a-4931-8c00-c68c5046a11f'::uuid, 'daabcc25-2ac7-4826-b03b-0a04c7bee349'::uuid), -- [Biscuits] Chicken Biscuit <- Chicken & Biscuits
      ('b2f478d5-0678-42cb-914b-271432792e94'::uuid, '9b3dbab9-3406-4847-ac08-f31020ab1365'::uuid), -- [Proprietors Bar & Table] Braised Short Rib <- Braised Short Rib
      ('91a5da8b-df4a-4820-9934-9bdd4b5aaa28'::uuid, '178ccd67-a12a-46da-8de0-4b7f53b71ed4'::uuid), -- [Proprietors Bar & Table] Lobster Arancini <- Lobster Arancini
      ('288f268b-8c7d-4cd3-8bb5-0eff6ed9b19f'::uuid, 'b43540c0-4985-4d1f-b9a8-4860d6b89033'::uuid), -- [Proprietors Bar & Table] Wood-Fired Mushroom Pizza <- Wood-Fired Mushroom Pizza
      ('31c662d2-bfb4-498e-abc9-fa522af0797b'::uuid, 'b0167338-321c-44f0-b17e-5682d912a84d'::uuid), -- [Proprietors Bar & Table] Smoked Fish Dip <- Smoked Fish Dip
      ('e9f6e0fb-9450-45fb-99a3-295be11a741d'::uuid, '7a0210c0-944c-40d3-87a7-b1e56e26d44f'::uuid), -- [Faregrounds] Lobster Roll <- Lobster Roll
      ('a2b98a9c-df04-4fec-baba-6b79831dcfcc'::uuid, '1cc3290e-f40c-4fdf-a5e5-8d94ddfe91de'::uuid), -- [Faregrounds] Milkshake <- Milkshake
      ('effd9fcf-795b-47bb-800b-a18e17919411'::uuid, 'ac58e8a3-a579-4c96-ad77-d2c71041e7f2'::uuid), -- [Faregrounds] Smash Burger <- Smash Burger
      ('2dc598c3-8f0e-42ea-87fe-1b9fff96bd9f'::uuid, 'b7cbf53f-73ef-463f-b520-fdb69ed92ade'::uuid), -- [Faregrounds] Fried Chicken Sandwich <- Fried Chicken Sandwich
      ('987d92be-8ecb-47ed-be6d-7313921b155d'::uuid, 'fd5781af-2ccb-4d91-b489-f9da2318be6f'::uuid), -- [Faregrounds] Seafood Platter <- Seafood Platter
      ('f303c43d-e7da-4ec7-bd3a-b047fd69f1a0'::uuid, 'b5a92013-0d2f-4127-9c33-8c474c1b8d7a'::uuid), -- [Alchemy Bistro & Bar] 10 oz Prime Ribeye Steak* <- 10 oz Prime Ribeye Steak
      ('5993d39e-6fc6-4aba-a680-cebfa2f5fbe4'::uuid, '9f1a48aa-3f2b-4724-86f6-2aa8b9619f8a'::uuid), -- [Alchemy Bistro & Bar] Tuna Tartare* <- Tuna Tartare
      ('c9eb9ea7-96df-4d7b-9d8b-ec76c3048e08'::uuid, '6971d14e-3bb7-432e-9fe7-aa1dc6692ba8'::uuid), -- [Alchemy Bistro & Bar] Fritto Misto* <- Fritto Misto
      ('aca2b561-61b7-4106-86de-8891190c45f9'::uuid, 'cd5a239b-4e3d-4b5a-971e-626b35604f99'::uuid), -- [Alchemy Bistro & Bar] Alchemy's Wagyu Burger* <- Alchemy's Wagyu Burger
      ('b0ec226a-3497-44f7-9869-278d9b45c9c7'::uuid, '4ee9f4d2-19c3-47c6-ab15-2625380fb3dd'::uuid), -- [The Rose & Crown] Thai Green Curry Mussels* <- Thai Green Curry Mussels
      ('44554329-2161-4738-ad55-c087a946c967'::uuid, '9c188c8c-c26d-4ac0-9063-b5913d91d272'::uuid), -- [The Rose & Crown] The Smokehouse* <- The Smokehouse
      ('d872b5e8-f8b9-424a-aa30-a3dcc6b7323b'::uuid, '31a6f48f-963c-48cd-ba25-ffe1211d98cd'::uuid), -- [The Rose & Crown] Grilled Rib Eye* <- Grilled Rib Eye
      ('7c8076e9-28ab-440b-9ff8-b4fc67d1f8e6'::uuid, '39e35ec3-1b00-4ae5-8fcb-aefc59dfc7ac'::uuid), -- [The Rose & Crown] The Sriracha Burger* <- The Sriracha Burger
      ('7cbc2877-75f9-42ce-8bbb-9b641a605487'::uuid, '32b2d54b-6629-45de-a7aa-6858d44864e1'::uuid), -- [The Rose & Crown] Wings <- Wings
      ('05622780-9ef4-404c-a9d2-990f0e143bcd'::uuid, '2f221025-7753-4072-9ccc-5c9883e1fd1e'::uuid), -- [The Rose & Crown] The Hangover* <- The Hangover
      ('959010be-4174-452a-b3ba-6f20db5095d6'::uuid, '1f50e663-b2c0-4089-9d69-05a299d13cfa'::uuid), -- [The Rose & Crown] Faroe Island Salmon* <- Faroe Island Salmon
      ('ef726023-0bf7-41ef-bd6d-14091d60a7be'::uuid, '0b893703-ca40-4768-a963-3d20187dc50f'::uuid), -- [The Rose & Crown] B-Y-O-B* <- B-Y-O-B
      ('c1405ea5-8f07-40f1-aa95-e248711bcd03'::uuid, 'eb4e25f2-7db9-44f1-9e48-47c7292cd942'::uuid), -- [The Rose & Crown] Nachos <- Nachos
      ('896a0e82-d081-4fe0-9814-423484c2f813'::uuid, '83d6a85a-ed11-40bc-9898-d1a132ca2ecf'::uuid), -- [The Rose & Crown] Pub Burger <- Pub Burger
      ('47af5f7a-2586-41ac-b01a-4daafb1d3d33'::uuid, '1342298d-ae56-412c-b9ce-fd0dc57c2c85'::uuid), -- [The Rose & Crown] Fish & Chips <- Fish & Chips
      ('16d2ddc9-ab19-4860-b6a9-02f6caf7e281'::uuid, '775b6fcc-284e-4c13-8170-1a8e8b9bc7df'::uuid), -- [Espresso Love] Black Angus Burger* <- Black Angus Burger
      ('06f9ce08-7f7c-45ae-8dbb-b28d29a1dc1e'::uuid, 'bdf5b6ce-e0a5-405e-8024-1f0f841af48c'::uuid), -- [Queequeg's] Pan-Roasted Cod <- Pan-Roasted Cod
      ('9e130616-724f-4f2e-a2a8-36154ae27355'::uuid, '361adb98-b82e-4b55-beb8-1537c48515af'::uuid), -- [Queequeg's] Clam Chowder <- Clam Chowder
      ('7b9889de-0728-43b1-9d8a-e59a9419837c'::uuid, '84a79463-4566-4007-befd-1b0bb8909507'::uuid), -- [Queequeg's] Lobster Roll <- Lobster Roll
      ('954d34b5-ac9c-4576-96fd-803cda1909bc'::uuid, 'a7e4704d-b720-46a0-bdb7-bcae26bf4d35'::uuid), -- [Queequeg's] Mushroom Risotto <- Mushroom Risotto
      ('f65df9a3-4f4c-4f91-b7ca-7c469bf8f310'::uuid, '128a9a93-ed90-473a-a247-238a2b321be6'::uuid), -- [Bluefish River Tavern] Veggie Primavera <- Veggie Primavera
      ('87810f52-c079-4feb-9d2b-7b069c86138a'::uuid, 'be1a7cf4-8858-4ead-be6e-51c4f4146f62'::uuid), -- [Bluefish River Tavern] Mac & Cheese <- Mac & Cheese
      ('a34518d3-f549-4326-92dc-0e03b8b5d3ce'::uuid, '83d65202-0e6a-44c9-86e9-b367f4bb3b40'::uuid), -- [Bluefish River Tavern] Short Ribs <- Short Rib
      ('ff6787ed-b204-492a-85bc-c76acb69adbf'::uuid, 'a5e50707-b299-4d6b-b304-8eb921f306ca'::uuid), -- [Bluefish River Tavern] Bolognese <- Bolognese
      ('3dc4395a-7fb6-4fd5-8110-8b2f225727b3'::uuid, '292c3f4f-94fe-4cfb-88da-06f96f33c21c'::uuid), -- [Bluefish River Tavern] Fried Chicken <- Fried Chicken
      ('ec0ecba3-e36b-4767-b587-0c029c7a4335'::uuid, 'eb0fb6b6-bfb3-4cdc-aef5-6d42326693a5'::uuid), -- [Bluefish River Tavern] BRT Burger <- BRT Burger
      ('6c97e0b7-fb23-4989-b680-8fb6ce64bc38'::uuid, 'eea1781b-ed6c-4470-ab25-4cf83f3a52a7'::uuid), -- [Bluefish River Tavern] Brazilian Fish Stew "Moqueca" <- Brazilian Fish Stew "Moqueca"
      ('9395c132-2fa9-4e3f-b779-599cbd0444cd'::uuid, 'ee182519-36a9-45af-84d8-0c2b43d13060'::uuid), -- [Bluefish River Tavern] Baked Haddock <- Baked Haddock
      ('19e4e8d1-8397-40b3-84fd-099ee6593d25'::uuid, '6f6a8f01-f1b2-4205-8c0d-28068f71f4fe'::uuid), -- [Bluefish River Tavern] Fish & Chips <- Fish & Chips
      ('6216f836-bd3f-45b8-b629-6516262f088c'::uuid, 'ba6dcd83-da6c-4cd2-98ea-1d32bddca86d'::uuid), -- [Bluefish River Tavern] Scallops <- Scallops
      ('42f5bd2c-d77c-42f2-bb63-de4b7addc121'::uuid, '0ce147e6-47ba-4bfb-b7fb-16fb9136b82f'::uuid), -- [Bluefish River Tavern] Salmon <- Salmon
      ('5b341e6a-0c7c-49e7-a1c5-60f081eeb26e'::uuid, '2e5da164-d936-4507-8efd-22b51322b074'::uuid), -- [Bluefish River Tavern] Fish Tacos <- Fish Tacos
      ('bb4b8c18-c396-481f-a67c-1b690dd0c4c7'::uuid, '36bf101a-44f1-4c8f-9b8c-b42374d72199'::uuid), -- [Bluefish River Tavern] BRT Steak Tips <- BRT Steak Tips
      ('e2aaa437-0680-46c3-8f1c-a2f97c0a31e9'::uuid, '9f7b7f22-1191-4a31-8558-584e4a44785e'::uuid), -- [Bluefish River Tavern] Shrimp Nduja <- Shrimp Nduja
      ('e01d5b33-c594-4a5f-b1ac-c41e49f8d24b'::uuid, '93904a23-ef89-41b0-b0fb-ba84d71c5f46'::uuid), -- [Cisco Brewers] Grey Lady <- Grey Lady
      ('780183ab-00f4-4fc0-971b-cc6837138ef3'::uuid, '57be9506-4495-4515-ad16-7d8b8a48561b'::uuid), -- [Cisco Brewers] Pretzel & Beer Cheese <- Pretzel & Beer Cheese
      ('6d48ca36-6781-4b76-824d-e1ec4e5f6f4e'::uuid, 'a7f8b592-b384-445b-bcb9-0ccceb671cec'::uuid), -- [Cisco Brewers] Pizza <- Pizza
      ('9ecf9921-da17-4edb-8423-a69731a85bb8'::uuid, '2f742b83-068c-4109-b69e-254616a8ff39'::uuid), -- [Cisco Brewers] Whale's Tale Pale Ale <- Whale's Tale Pale Ale
      ('f3f346ac-dcf3-401e-98fa-10dfb1cfa2d0'::uuid, '396572a2-eb50-477a-9a8e-17ac76fb1f40'::uuid), -- [Provisions] Turkey Cranberry Sandwich <- Turkey Cranberry Sandwich
      ('2622c4df-3a7c-416a-9806-f2d95f34f61c'::uuid, '4d158365-28c6-45ed-9aa2-b0809cb19313'::uuid), -- [Provisions] Lobster Roll <- Lobster Roll
      ('bfd3785d-7607-468a-9dd5-67e9bca1aa55'::uuid, '927b5554-b494-428c-b2eb-a0ba5a360e65'::uuid), -- [Provisions] Fresh Baked Cookie <- Fresh Baked Cookie
      ('d80f8375-b929-403a-ab4e-255f69c794a6'::uuid, '1b5ba09d-ba52-416c-a889-6af0eb3eb042'::uuid), -- [Fog Island Cafe] Breakfast Burrito <- Breakfast Burrito
      ('156164ae-2398-47f3-abf3-163b11bc1ed4'::uuid, '5cc41438-1fdd-42c7-a934-8194b68d2ada'::uuid), -- [Fog Island Cafe] Lobster Quiche <- Lobster Quiche
      ('6211e941-9a27-4340-9200-c4563a0d5834'::uuid, '256b753b-86be-453f-8dc7-1a1686fcd2f5'::uuid), -- [Fog Island Cafe] Cranberry Scone <- Cranberry Scone
      ('2236a783-202e-4830-b9bb-a9b8bf6be907'::uuid, 'bc36e76e-ee29-4d48-95a5-13d64e128c46'::uuid), -- [Fog Island Cafe] Eggs Benedict <- Eggs Benedict
      ('e8928acc-e272-40cc-899e-fab3f84d5ff0'::uuid, '7c753d05-47f8-4afe-a720-783945350444'::uuid), -- [Kitty Murtagh's] Kitty's Porterhouse Burger* <- Kitty's Porterhouse Burger
      ('1a996144-a059-467c-8b27-81a24426001b'::uuid, '6f028bb6-5676-41de-b8c7-05574d3bab21'::uuid), -- [Kitty Murtagh's] Irish Fry Up* <- Irish Fry Up
      ('972e1cbe-fa75-4da2-8c26-b5de72f6b6b4'::uuid, '4bd43888-dad2-4ec7-820a-5a3a392b96f2'::uuid), -- [Kitty Murtagh's] Classic Caesar <- Classic Caesar*
      ('bea1e9d4-ee74-4329-a602-31c58c83f97c'::uuid, '4060c5c7-58b1-4d48-be31-8afcbe9598aa'::uuid), -- [Nantucket Bake Shop] Donuts <- Cookies
      ('0353f162-49d4-4a40-9538-8445de05578f'::uuid, '0ff8701e-7c16-4c90-8109-41294fac6967'::uuid), -- [Sayle's Seafood] Lobster Roll <- Lobster Roll
      ('5c438147-9619-44cf-903c-3382b558a2e3'::uuid, '63a98783-6460-4af6-be39-69278bff61f4'::uuid), -- [Sayle's Seafood] Fish & Chips <- Fish & Chips
      ('3a31a5fa-a202-4083-9325-aae233799528'::uuid, '132d3bb5-d32b-4231-9a51-eb00c11a82db'::uuid), -- [Sayle's Seafood] Clam Chowder <- Clam Chowder
      ('639397f9-66af-4bad-beeb-777978d1ad4b'::uuid, 'a50326fc-9b7f-4e3b-ada3-d2636f3959fa'::uuid), -- [Sayle's Seafood] Fried Clam Plate <- Fried Clam Plate
      ('bcc796e3-da54-49dd-82ea-60aee52f3c1b'::uuid, '83df400e-df9f-4bf1-9143-b65d5ae2daba'::uuid), -- [Millie's] Lobster Quesadilla <- Lobster Quesadilla
      ('f13882d9-5d3e-4636-b8e7-335248c178c1'::uuid, '912ad586-c8fb-4f07-bc77-d25273553c85'::uuid), -- [Millie's] Baja Burrito <- Baja Burrito
      ('f338ea20-2c67-49c1-a867-339dab40568e'::uuid, '3fd932ff-ed83-4ad5-a855-52cfd0f5844b'::uuid), -- [Millie's] Fish Tacos <- Fish Tacos
      ('1b022a05-b115-483e-9d36-2ed56341d86b'::uuid, 'b4556bdb-dedc-4d5e-a1d9-0bb693d7fdb9'::uuid), -- [Millie's] Madaket Sunset Margarita <- Madaket Sunset Margarita
      ('fba208ab-0b54-4e76-ad0f-46ed598ee5ff'::uuid, '59520be1-2a0f-4124-8ec1-078f8eda8b29'::uuid), -- [L'etoile Restaurant] Soup of Cauliflower, Leeks & Apple <- Soup of Cauliflower, Leeks Apple
      ('df7a937a-8d0e-440d-a96f-1977457f6152'::uuid, '4e080798-97c8-46df-a196-7e2fc2d2cf8a'::uuid), -- [L'etoile Restaurant] Chilled Menemsha Spearpoint Oysters <- Chilled Menemsha "Spearpoint" Oyste
      ('f7d1f33a-933f-47e7-9365-db317e48c539'::uuid, '45f654db-c762-49b2-819f-714de67291c9'::uuid), -- [Pi Pizzeria] Caesar Salad <- Caesar Salad
      ('3c5b87c4-5bd3-4389-aa44-02e1de74f839'::uuid, '653187fa-0407-408a-9f7d-f2c626a037e3'::uuid), -- [Pi Pizzeria] Margherita Pizza <- Margherita Pizza
      ('f186806a-0ce6-466d-ad5a-98dabfbfdcd6'::uuid, 'd2cd81e0-2701-4d4c-8d3b-bc24682dc80d'::uuid), -- [Pi Pizzeria] Meatballs <- Meatball
      ('3945a439-0826-4b52-b34b-1496d4d30e7e'::uuid, '7fddd366-c8df-4f30-97b2-51df130c6b9f'::uuid), -- [Pi Pizzeria] White Clam Pizza <- White Clam Pizza
      ('c0565e43-274a-44b3-98e4-cd4eb04ef497'::uuid, '7dc39fee-5afb-42d6-8d3e-b74716a5be9e'::uuid), -- [Pi Pizzeria] Meatball Sub <- Meatball Sub
      ('32b47a51-6b20-42c3-8db8-fd435b8459e2'::uuid, '6dc52df2-71d7-461d-9796-afbd3364478b'::uuid), -- [Straight Wharf Restaurant] Grilled Swordfish <- Grilled Swordfish
      ('443e61a1-0bc1-40f8-a9e1-2971d8b29b50'::uuid, 'f514bf2c-80fe-41d3-a772-03fd47bc7c67'::uuid), -- [Straight Wharf Restaurant] Nantucket Bay Scallops <- Nantucket Bay Scallops
      ('283e0104-361c-4677-838a-a46c28df474f'::uuid, 'a153f9fc-0338-4956-ae41-09ec754dddd9'::uuid), -- [Straight Wharf Restaurant] Oysters on the Half Shell <- Oysters on the Half Shell
      ('78730213-13fd-413b-aad7-926b0d8bf8ab'::uuid, 'b0e286d7-cbbf-44ae-8a42-5baebdca42cd'::uuid), -- [Straight Wharf Restaurant] Lobster Risotto <- Lobster Risotto
      ('1b4d6f6e-87ba-4b7f-9735-93acbd7c91e4'::uuid, '9d7bb496-60e7-4feb-80c3-1dc8f986a353'::uuid), -- [Straight Wharf Restaurant] Blueberry Tart <- Blueberry Tart
      ('06d0880b-7a70-4877-a8b7-b57d86e850aa'::uuid, 'ab77944d-71a3-4766-a2ed-5105017def73'::uuid), -- [Loco Taqueria & Oyster Bar] Guacamole <- Guacamole
      ('1051d83b-c757-4303-ad0c-0010b00a957c'::uuid, 'e4ed8c6f-580d-4983-9773-fb20a12a64d0'::uuid), -- [Loco Taqueria & Oyster Bar] Nachos <- Nachos
      ('55f7ef41-8fa4-4c1b-87aa-7872562a114e'::uuid, '6ce8585a-bc50-4b9b-a30e-b3afdd9fe4cd'::uuid), -- [Loco Taqueria & Oyster Bar] BBQ Chicken Quesadilla <- BBQ Chicken Quesadilla
      ('f43d65fd-cab0-4340-bd54-dad48d21cb5c'::uuid, '26a18363-4463-4aa8-b05d-075422c2e538'::uuid), -- [Loco Taqueria & Oyster Bar] Smash Burger <- Smash Burger
      ('2ae27f9e-ef9a-4d0d-9b45-9c783132b7af'::uuid, 'fdb70463-fa52-468b-92fc-f51784c14b3a'::uuid), -- [Loco Taqueria & Oyster Bar] Loaded Wings <- Loaded Wings
      ('895cd8b0-5f5d-40dc-8001-bcc1f7b7269d'::uuid, 'f1eac9c6-a9d6-47c1-82ba-51f657dd5cdc'::uuid), -- [Loco Taqueria & Oyster Bar] Vegetable Quesadilla <- Vegetable Quesadilla
      ('6c2666ec-1e0d-41f5-9bbe-bd79202d5d83'::uuid, 'f3df3406-e5e4-4a21-894e-dcbeed8b8380'::uuid), -- [Loco Taqueria & Oyster Bar] Bacon, Egg, & Cheese <- Bacon Egg & Cheese
      ('8c59dfb5-dd4b-4920-8c7d-804c3ec63a8f'::uuid, 'fe72938c-3ddd-4d1c-b7c1-a7426b65ca14'::uuid), -- [Loco Taqueria & Oyster Bar] Street Corn <- Street Corn
      ('57d296dc-f8b4-43fa-a0b7-80581b580ee9'::uuid, 'e210d72d-7034-4027-a88c-9bbb0e77d269'::uuid), -- [Loco Taqueria & Oyster Bar] Steak & Bacon Quesadilla <- Steak & Bacon Quesadilla
      ('414bcae4-7989-461c-b263-758d1eae706b'::uuid, 'f2810f0a-d4e5-409c-bf2b-1e03f21d134d'::uuid), -- [Lola 41] Lobster Pad Thai <- Lobster Pad Thai
      ('3d65ffca-2a23-467e-820f-e06765de180b'::uuid, 'bc8ff786-18d4-4abc-8f2a-a3c92fddc30a'::uuid), -- [Lola 41] Wagyu Sliders <- Wagyu Sliders
      ('bf873445-b1f8-49c2-bf27-f09c10651d38'::uuid, '872630d5-96c7-465e-8c1e-e87e42814504'::uuid), -- [Lola 41] Crispy Rice & Tuna <- Crispy Rice & Tuna
      ('140413ed-f86d-4276-a7f4-b93313c69f64'::uuid, '67d526f4-7475-4657-8a5e-776d3c40481b'::uuid), -- [Lola 41] Spicy Tuna Roll <- Spicy Tuna Roll
      ('54a8c6e4-bd84-424f-aa93-acabc71cccfa'::uuid, 'd7c1f070-0554-4b73-8a9a-ceec46c9e25e'::uuid), -- [9 Craft Kitchen and Bar] FILET MIGNON* <- Filet Mignon
      ('f99abdee-8dbe-4bea-a1cc-eb0d011223dc'::uuid, '0bfe3cca-69dd-4260-9150-3e19d49e14dd'::uuid), -- [9 Craft Kitchen and Bar] CASHEW CRUSTED TUNA* <- CASHEW CRUSTED TUNA
      ('61642e1c-bc82-4308-9596-a9b91324ee89'::uuid, 'a80809ab-55e7-4a26-841c-01add9a7fe4a'::uuid), -- [9 Craft Kitchen and Bar] OLIVE OIL POACHED NIÇOISE* SALAD <- Olive Oil Poached Niçoise Salad
      ('9eedc0ec-b830-4078-b848-00f283c82de9'::uuid, '7f3f7ac0-cf44-4a15-b3f7-37359c28b325'::uuid), -- [9 Craft Kitchen and Bar] THE BURGER* <- The Burger
      ('d07818f2-541d-4cb6-8d52-704eaec30944'::uuid, '184a079a-ffd4-47a6-a1a8-4c7c666fbd24'::uuid), -- [9 Craft Kitchen and Bar] WAGYU SKIRT STEAK* <- Wagyu Skirt Steak
      ('d926b3ff-9e7a-4654-855a-daa49d4b68a6'::uuid, '2bf9a3d1-dc31-4985-ad27-3f1d702ba390'::uuid), -- [The Nautilus] Coconut Curry Mussels <- Coconut Curry Mussels
      ('58b7801d-8c25-47c8-983e-16aaab887960'::uuid, '1f28280c-ea4b-4d4f-9906-31eec906cbd1'::uuid), -- [The Nautilus] Crispy Duck Salad <- Crispy Duck Salad
      ('eed16aad-cf44-47e5-aa31-fcd0c9ace662'::uuid, 'a3ec1e49-b8cb-45f8-a083-8b54d641eab8'::uuid), -- [The Nautilus] Short Rib Bao Buns <- Short Rib Bao Buns
      ('c63540e1-c946-434f-b368-2651fb0810de'::uuid, 'd4f3b7f6-e3b3-4a3f-93b6-db767bcbe739'::uuid), -- [The Nautilus] Crispy Whole Fish <- Crispy Whole Fish
      ('65478c8c-93bf-48b5-bf99-8fe4151fe042'::uuid, '5bffd523-79dc-4cb7-a0e8-0666ff7bd3d0'::uuid), -- [The Nautilus] Tuna Crudo <- Tuna Crudo
      ('f6f4fe7c-908f-4014-85af-9aa2402ec66a'::uuid, '429eb890-9f31-4b96-b045-7248837f31cc'::uuid), -- [Gio's Pizza] VEAL PARMESAN <- VEAL PARMESAN
      ('f6f4fe7c-908f-4014-85af-9aa2402ec66a'::uuid, '19f44e2c-94f0-4661-97fc-2f3c4c191e84'::uuid), -- [Gio's Pizza] VEAL PARMESAN <- VEAL PARMESAN
      ('7bf28cc0-86cc-480f-8b31-c084d1d6b203'::uuid, '86f5425e-f50e-4b4b-a94a-a44835a6063d'::uuid), -- [Gio's Pizza] CHICKEN PARMESAN <- CHICKEN PARMESAN
      ('7bf28cc0-86cc-480f-8b31-c084d1d6b203'::uuid, 'e66402bd-34eb-4689-8dc2-de4df3af4717'::uuid), -- [Gio's Pizza] CHICKEN PARMESAN <- CHICKEN PARMESAN
      ('3fab1926-82f7-4a31-abc9-810d8214364f'::uuid, '3761ad27-d508-4a35-9cc5-3df2e483311a'::uuid), -- [Wicked Island Bakery] Morning Glory Muffin <- Morning Glory Muffin
      ('53269039-a9cb-4797-9b26-b9701f162494'::uuid, 'fcc119fd-7269-46f1-801d-769cc91a27a9'::uuid), -- [Wicked Island Bakery] Cinnamon Roll <- Cinnamon Roll
      ('0496df7a-8c97-4c2f-a2f4-18171836a38e'::uuid, '655172eb-d460-43a8-b4d5-85b918bf6ab1'::uuid), -- [Wicked Island Bakery] Breakfast Sandwich <- Breakfast Sandwich
      ('89b49d56-d8cb-4006-8db7-88707bcc32a9'::uuid, 'd1c5c99b-d102-4812-92f4-83572a9c8e42'::uuid), -- [Square Rigger] SHRIMP PO'BOY <- Shrimp Po Boy
      ('35b93b7c-9cac-4b26-9e98-54f120bf2c39'::uuid, '13b35c52-dbbe-408a-a41b-7523583bc335'::uuid), -- [Topper's at The Wauwinet] Truffle Risotto <- Truffle Risotto
      ('495351ef-98cf-4aa7-92c0-e3f90cf1c371'::uuid, '3768a68e-a6cf-44c9-9b88-5cfbdccb21b6'::uuid), -- [Topper's at The Wauwinet] Wagyu Tartare <- Wagyu Tartare
      ('b77b1b70-9d82-4bed-893c-89dbfbc6cc09'::uuid, 'b6c11de0-5031-4b39-9b8d-ea8a99cc6f2f'::uuid), -- [Topper's at The Wauwinet] Spring Harvest <- Spring Harvest
      ('342378fc-a22a-4321-b798-f5a5c378d1bf'::uuid, '3e12d228-27e2-4bc4-a9fa-2bea6a92f354'::uuid), -- [Topper's at The Wauwinet] Pavlova <- Pavlova
      ('47335b1c-9c51-45b2-acc6-99b3ceb4a2c5'::uuid, '6e78a3af-be71-4d5a-96c7-ab52d3b72288'::uuid), -- [Topper's at The Wauwinet] American Wagyu <- American Wagyu
      ('5cad4d24-4998-42a5-b5a5-46f81bf49a4a'::uuid, '45f2af98-c22e-4a30-96b5-40978daf115d'::uuid), -- [Topper's at The Wauwinet] Japanese Yellowtail* <- Japanese Yellowtail*
      ('ae4952d4-d5e6-4753-b860-6beb324352f2'::uuid, '8b3c7758-cfd3-4756-aa07-5d92da87ce88'::uuid), -- [Topper's at The Wauwinet] Norwegian Arctic Char <- Norwegian Arctic Char
      ('89f8d362-0e8e-43ff-b6bd-db7b12aa3aff'::uuid, '6476557d-9c13-4395-911a-369426bc722c'::uuid), -- [Topper's at The Wauwinet] Pan-Seared Scallops <- Pan-Seared Scallops
      ('2c40039e-7844-460c-be8f-14a2eda822e4'::uuid, 'dd3a40bf-2578-4abf-8c8d-1f9e7af1d395'::uuid), -- [Topper's at The Wauwinet] Lobster Tasting Menu <- Lobster Tasting Menu
      ('81f23aa5-cf8c-42b1-986b-b9f2876ba5db'::uuid, '16a4e37b-c8e8-4f3d-9bfd-27ecfa80f039'::uuid), -- [CRU Nantucket] Rosé All Day Frosé <- Rosé All Day Frosé
      ('9296a00b-9771-4755-afae-7f5ccae4957b'::uuid, 'ac1595b7-02c5-468c-b590-7acaf0997821'::uuid), -- [CRU Nantucket] Oyster Plateau <- Oyster Plateau
      ('dc23b1b6-4e69-45f6-b275-5ea88b582064'::uuid, 'b4c14ef9-4a55-4bb1-9e54-7fa8dd2c9750'::uuid), -- [CRU Nantucket] Tuna Tartare <- Tuna Tartare
      ('d2e83853-a454-45a2-98d2-d6fdde69504b'::uuid, '94c45339-31db-4f53-b64c-c2a98bf8b16a'::uuid), -- [CRU Nantucket] Lobster Roll <- Lobster Roll
      ('f9676174-10be-4187-9580-8f678bd9e43b'::uuid, '1116a1ce-8ef6-40d2-bd69-7f713396c67e'::uuid), -- [CRU Nantucket] Grilled Whole Fish <- Grilled Whole Fish
      ('1c9f87a2-fae4-4cb0-af7f-e76edf0579a0'::uuid, 'c2350918-6918-4ab3-9153-53e1d60ded80'::uuid), -- [Black-Eyed Susan's] Sourdough French Toast <- Sourdough French Toast
      ('3487fb2f-29b3-431e-a710-bc058864b103'::uuid, 'b719e4f1-4dbb-45d6-b817-7193aaef38cd'::uuid), -- [Black-Eyed Susan's] Corn Cakes with Salsa <- Corn Cakes with Salsa
      ('7b41bc7a-339f-4dfa-bc3e-f1a63ab3e4a4'::uuid, 'bf0357c5-45b2-4c43-97e8-5c4501b69c85'::uuid), -- [Black-Eyed Susan's] Thai Curry Mussels <- Thai Curry Mussels
      ('fd930abd-4a6e-4475-925d-8be426c49894'::uuid, 'f832082e-0522-4bc9-a769-1ec2460b972c'::uuid), -- [Black-Eyed Susan's] Pan-Seared Halibut <- Pan-Seared Halibut
      ('72b35937-9463-46d9-b81b-08e27e3462e2'::uuid, '73a88665-0203-40a4-ae1f-eb3448a27d4d'::uuid), -- [Ventuno] Branzino <- Branzino
      ('9ffe24df-acea-42b6-91b9-38b95409857e'::uuid, 'dc0bd68f-b309-4f50-9f17-553a279a3f8a'::uuid), -- [Ventuno] Tiramisu <- Tiramisu
      ('1eaf53fe-fb7c-4b14-b06e-d22a825c6636'::uuid, '7bd9fd24-5114-403f-b495-935a48137c44'::uuid), -- [Ventuno] Burrata & Prosciutto <- Burrata & Prosciutto
      ('017b488a-08d3-4183-9845-217ee13f670c'::uuid, '2a0fdf8e-98f4-47f9-8627-1cf5c2e2ce6c'::uuid), -- [Ventuno] Handmade Pappardelle <- Handmade Pappardelle
      ('14d67792-38af-4af7-96e9-90e864e968c8'::uuid, 'a33528c3-65d3-45bf-9158-ab90efca72a4'::uuid), -- [Boarding House] Raw Bar Tower <- Raw Bar Tower
      ('33b3bb10-f38f-462d-a4b3-14b44debcf87'::uuid, 'f3f04597-b73d-43a3-b4a4-e30e074852fb'::uuid), -- [Boarding House] Fried Oysters <- Fried Oysters
      ('6cb1dfb0-368c-4acd-b4e4-b41d7097f6c3'::uuid, 'e4a985c5-9335-49ea-a1d3-feb77cbc538b'::uuid), -- [Boarding House] Lobster & Truffle Mac <- Lobster & Truffle Mac
      ('7744b464-7700-46bf-9cb2-1574865a4a83'::uuid, 'bc03d93f-3de6-45be-a31e-027f8464d826'::uuid), -- [Boarding House] Grilled Pork Chop <- Grilled Pork Chop
      ('4725c629-2599-4933-afa9-fd47f457c63c'::uuid, '2182710f-a2dd-44e8-96c9-95a5f4ad2066'::uuid), -- [The Wharf] "Irish Nachos" <- Irish Nachos
      ('a6d6470f-5398-4d78-91bf-49e1e571700f'::uuid, 'a7db393e-c81b-4f1a-9a31-b33380de2cdb'::uuid)  -- [The Wharf] "Beyond" Burger <- Beyond Burger
    ) AS pairs(keeper, loser)
  LOOP
    DELETE FROM votes WHERE dish_id = pair.loser AND source='user'
      AND user_id IN (SELECT user_id FROM votes WHERE dish_id=pair.keeper AND source='user');
    UPDATE votes SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM favorites WHERE dish_id = pair.loser
      AND user_id IN (SELECT user_id FROM favorites WHERE dish_id=pair.keeper);
    UPDATE favorites SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM dish_photos WHERE dish_id = pair.loser
      AND user_id IN (SELECT user_id FROM dish_photos WHERE dish_id=pair.keeper);
    UPDATE dish_photos SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM local_list_items WHERE dish_id = pair.loser
      AND list_id IN (SELECT list_id FROM local_list_items WHERE dish_id=pair.keeper);
    UPDATE local_list_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM user_playlist_items WHERE dish_id = pair.loser
      AND playlist_id IN (SELECT playlist_id FROM user_playlist_items WHERE dish_id=pair.keeper);
    UPDATE user_playlist_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM dishes WHERE id = pair.loser;
  END LOOP;
END $$;

SELECT COUNT(*) AS final_total_dishes_with_restaurant FROM dishes WHERE restaurant_id IS NOT NULL;

COMMIT;
